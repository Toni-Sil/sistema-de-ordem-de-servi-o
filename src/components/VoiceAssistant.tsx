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
          
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          
          const prompt = `
            Você é um assistente especializado em gestão de tapeçarias. 
            Analise o áudio e extraia informações para uma nova Ordem de Serviço (OS).
            
            Lista de clientes cadastrados:
            ${clients.map(c => `- ${c.name} (ID: ${c.id})`).join('\n')}
            
            Tente encontrar o cliente na lista acima. Se não encontrar, retorne o nome mencionado.
            O sistema pode cadastrar novos clientes se você extrair o nome e o whatsapp corretamente.
            
            Extraia os seguintes campos em JSON:
            - client_id: ID do cliente se encontrado na lista, caso contrário null.
            - clientName: Nome do cliente mencionado (se não encontrado na lista).
            - whatsapp: Número do WhatsApp mencionado (se não encontrado na lista).
            - furnitureType: Tipo de móvel (ex: Sofá, Poltrona, Cadeira).
            - fabric: Tipo de tecido mencionado.
            - description: Descrição detalhada do serviço.
            - priority: 'baixa', 'media' ou 'alta'.
            - deadline: Data sugerida no formato YYYY-MM-DD (se mencionada).
          `;

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "audio/webm",
                  data: base64Audio,
                },
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  client_id: { type: Type.STRING, nullable: true },
                  clientName: { type: Type.STRING, nullable: true },
                  whatsapp: { type: Type.STRING, nullable: true },
                  furnitureType: { type: Type.STRING },
                  fabric: { type: Type.STRING },
                  description: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ['baixa', 'media', 'alta'] },
                  deadline: { type: Type.STRING, nullable: true },
                },
                required: ['furnitureType', 'fabric', 'description', 'priority'],
              },
            },
          });

          const extractedData = JSON.parse(response.text);
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
