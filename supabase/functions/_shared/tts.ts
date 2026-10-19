// Gemini 3.8 uses Interactions speech metadata and explicit PCM output.
// Keeping PCM explicit avoids wrapping a WAV file in a second WAV header.
export async function generateVoice(key: string, model: string, text: string, signal: AbortSignal): Promise<{pcm: string; sampleRate: number}> {
  const modern = /^gemini-3\.8-.*tts/.test(model);
  const endpoint = modern
    ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = modern ? {
    model,
    input: [{type: 'user_input', content: [{type: 'text', text,
      annotations: [{type: 'speech_metadata', style: 'warm, natural and clear'}]}]}],
    response_format: {type: 'audio', mime_type: 'audio/l16', sample_rate: 24000},
    generation_config: {speech_config: [{voice: 'Kore'}]},
  } : {
    contents: [{parts: [{text: `Read warmly and naturally in the language of this text: ${text}`}]}],
    generationConfig: {responseModalities: ['AUDIO'], speechConfig: {
      voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Kore'}}}},
  };
  const response = await fetch(endpoint, {method: 'POST', signal,
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify(body)});
  if (!response.ok) throw new Error(response.status === 429
    ? 'Gemini voice quota reached' : `Gemini voice unavailable (HTTP ${response.status})`);
  const data = await response.json();
  let pcm: unknown;
  if (modern) {
    const steps = Array.isArray(data.steps) ? data.steps : [];
    for (const step of steps) {
      if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
      for (const part of step.content) if (part.type === 'audio' && typeof part.data === 'string') pcm = part.data;
    }
  } else {
    pcm = data?.candidates?.[0]?.content?.parts?.find((p: {inlineData?: unknown}) => p.inlineData)?.inlineData?.data;
  }
  if (typeof pcm !== 'string' || !pcm) throw new Error('No audio returned');
  return {pcm, sampleRate: 24000};
}
