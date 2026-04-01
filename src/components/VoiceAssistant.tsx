import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";

interface VoiceAssistantProps {
  onDataExtracted: (data: any) => void;
  clients: { id: string, name: string }[];
}

export function VoiceAssistant({ onDataExtracted, clients }: VoiceAssistantProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Erro ao acessar o microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        try {
          const base64Audio = (reader.result as string).split(',')[1];
          
          const aiProvider = localStorage.getItem('AI_PROVIDER') || 'gemini';
          const savedKey = localStorage.getItem('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
          
          if (!savedKey) {
            throw new Error('Chave de API não configurada.');
          }

          const prompt = `
            Você é um assistente especializado em gestão de tapeçarias. 
            Extraia informações para uma nova Ordem de Serviço (OS).
            
            Lista de clientes cadastrados:
            ${clients.map(c => `- ${c.name} (ID: ${c.id})`).join('\n')}
            
            TABELA DE SERVIÇOS E PREÇOS (se o serviço mencionado se encaixar num desses perfis, atribua o valor correspondente no campo "value" do JSON):
            - Cama gaúcha leito / Cama gaúcha luxo / Cama gaucha (Sofá-cama): 2600.00
            - Sofá-cama Constellation / Vox Delivery / MB Acelo Bolha / Cabine simples luxo (Sofá-cama): 2400.00
            - Sofá-cama econômico / Econômico cabine simples (Sofá-cama): 2050.00
            - Sofá-cama Voxter Livre: 2500.00
            - Cama gaúcha econômica: 2100.00
            - Forração cabine (Reforma): 3600.00
            - Ar-condicionado (Climatização padrão): 5500.00
            - Ar condicionado (Climatização superior): 6600.00
            - Tapete Courino cabine leito (Reforma): 1200.00
            - Maleiro teto alto / Maleiro / Tapete Courino / Tapete assoalho / Reforma banco motorista: 950.00
            - Maleiro teto baixo (Armazenamento): 850.00
            - Jogo cortina (Reforma): 450.00
            - Capa painel (Reforma): 420.00
            - Conserto trilho (Conserto): 250.00
            - Forração porta (Reforma): 240.00

            Extraia os seguintes campos OBRIGATORIAMENTE em JSON puro:
            {
              "client_id": "ID se encontrado, senao null",
              "clientName": "Nome se não encontrado, senao null",
              "whatsapp": "Numero se não encontrado, senao null",
              "furnitureType": "Sofá, Poltrona, Cortina... (Obrigatorio)",
              "fabric": "Tecido mencionado",
              "truckPlate": "Placa se houver, senao null",
              "truckModel": "Modelo se houver, senao null",
              "description": "Detalhes completos do serviço e restrições (Obrigatorio)",
              "priority": "baixa, media ou alta (Obrigatorio)",
              "deadline": "YYYY-MM-DD",
              "value": "Preço tabelado caso encontrado (ex: '2600.00'), se não encontrar deixe nulo ou tente inferir baseado no valor mais próximo"
            }
          `;

          let extractedData = null;

          if (aiProvider === 'openai') {
            // 1. Transcribe Audio
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', 'whisper-1');
            
            const transRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${savedKey}` },
              body: formData
            });
            
            if (!transRes.ok) throw new Error('Falha na transcrição OpenAI');
            const transcription = await transRes.json();
            
            // 2. Extact attributes
            const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${savedKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: prompt },
                  { role: "user", content: "Transcrevi um áudio do técnico. Extraia o JSON conforme regra:\n" + transcription.text }
                ]
              })
            });
            if (!gptRes.ok) throw new Error('Falha na extração JSON da OpenAI');
            const gptData = await gptRes.json();
            extractedData = JSON.parse(gptData.choices[0].message.content);

          } else {
            // Gemini
            const payload = {
              contents: [{
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: "audio/webm", data: base64Audio } }
                ]
              }],
              generationConfig: { responseMimeType: "application/json" }
            };

            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${savedKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (!geminiRes.ok) throw new Error('Falha na comunicação com o Gemini');
            const geminiData = await geminiRes.json();
            const textResponse = geminiData.candidates[0].content.parts[0].text;
            extractedData = JSON.parse(textResponse);
          }

          onDataExtracted(extractedData);
        } catch (err) {
          console.error('Error processing audio with AI:', err);
          setError('Erro ao processar o áudio com a IA. Tente novamente.');
        } finally {
          setIsProcessing(false);
        }
      };
    } catch (err) {
      console.error('Error processing audio with AI:', err);
      setError('Erro ao processar o áudio com a IA. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-[32px] border border-indigo-100 dark:border-indigo-900/30">
      <div className="flex items-center gap-3 w-full">
        <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
          <Wand2 size={20} />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold dark:text-white">Assistente de Voz IA</h4>
          <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-widest">
            {isRecording ? 'Gravando áudio...' : isProcessing ? 'IA processando...' : 'Fale os detalhes da OS'}
          </p>
        </div>
        
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
            isRecording 
              ? 'bg-rose-500 text-white animate-pulse' 
              : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
          } disabled:opacity-50`}
        >
          {isProcessing ? <Loader2 className="animate-spin" size={24} /> : isRecording ? <Square size={24} /> : <Mic size={24} />}
        </button>
      </div>
      
      {error && (
        <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">{error}</p>
      )}
      
      <AnimatePresence>
        {isRecording && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex gap-1 items-center"
          >
            {[1, 2, 3, 4, 5].map(i => (
              <motion.div
                key={i}
                animate={{ height: [8, 16, 8] }}
                transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                className="w-1 bg-rose-500 rounded-full"
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
