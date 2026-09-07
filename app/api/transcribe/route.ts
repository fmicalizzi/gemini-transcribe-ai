import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const ai = new GoogleGenAI();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('audio') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Save to temp file
    const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.webm`);
    await fs.writeFile(tempFilePath, buffer);
    
    // Upload to Files API
    const uploadedFile = await ai.files.upload({
      file: tempFilePath,
      config: { mimeType: file.type || 'audio/webm' }
    });
    
    // Clean up temp file
    await fs.unlink(tempFilePath).catch(console.error);
    
    // Poll for processing
    let fileState = uploadedFile.state;
    while (fileState === 'PROCESSING') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const check = await ai.files.get({ name: uploadedFile.name! });
      fileState = check.state;
    }

    if (fileState === 'FAILED') {
      throw new Error('File processing failed on server');
    }

    // Call Interactions API
    const interaction = await ai.interactions.create({
      model: 'gemini-3.5-transcribe',
      generation_config: {
        transcription_config: { mode: 'smart' }
      },
      input: [
        { type: 'audio', uri: uploadedFile.uri!, mime_type: (uploadedFile as any).mime_type || (uploadedFile as any).mimeType } as any
      ]
    }) as any;

    // Cleanup
    await ai.files.delete({ name: uploadedFile.name! }).catch(console.error);

    return NextResponse.json({ text: interaction.output_text || '' });
    
  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
