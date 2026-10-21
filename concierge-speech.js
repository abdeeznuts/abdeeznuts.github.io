import {loadNeuralVoice,speakNeuralVoice,cancelNeuralSpeech,neuralVoiceReady} from './neural-voice.js';
export function createSpeech({locale,onState,onTranscript,onNotice}){
 let recognizer,utterance,closed=false,ticket=0,startTimer,endTimer;
 let context,source,releasePlayback;
 const english=locale.startsWith('en');
 const unlock=()=>{if(!english)return;const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;context??=new Audio();context.resume().catch(()=>{});const silent=context.createBufferSource();silent.buffer=context.createBuffer(1,1,context.sampleRate);silent.connect(context.destination);silent.start()};
 const synth=globalThis.speechSynthesis;
 const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
 const voice=()=>{const list=synth?.getVoices()||[],match=list.filter(v=>v.lang.toLowerCase().split('-')[0]===locale.toLowerCase().split('-')[0]);return match.find(v=>/Serena|Samantha|Karen|Siri|Monica|Mónica|Laila|Majed/i.test(v.name))||match.find(v=>v.lang===locale)||match[0]};
 const stop=()=>{ticket++;clearTimeout(startTimer);clearTimeout(endTimer);cancelNeuralSpeech();if(source){source.onended=null;try{source.stop()}catch{}source.disconnect();source=null}releasePlayback?.();releasePlayback=null;if(recognizer){recognizer.onend=null;recognizer.onresult=null;recognizer.onerror=null;recognizer.abort();recognizer=null}if(utterance){utterance.onend=null;utterance.onerror=null;utterance.onstart=null;utterance=null;synth?.cancel()}if(!closed)onState('idle')};
 const speakNatural=async(text,current)=>{
  try{
   if(!context)throw new Error('Tap Listen again to enable audio on this device.');
   onState('thinking');
   if(!neuralVoiceReady())await loadNeuralVoice(p=>{if(current===ticket&&!closed)onNotice(p.message+' '+Math.round((p.fraction||0)*100)+'%')});
   if(current!==ticket||closed)return;
   onNotice('');
   // Short chunks start speaking sooner and avoid the model's phoneme limit.
   const chunks=[];for(const sentence of text.match(/[^.!?]+[.!?]*/g)||[text]){let part='';for(const word of sentence.trim().split(/\s+/)){if((part+' '+word).length>260&&part){chunks.push(part);part=''}part+=(part?' ':'')+word}if(part)chunks.push(part)}
   for(const chunk of chunks){
    if(current!==ticket||closed)return;onState('thinking');const audio=await speakNeuralVoice(chunk);if(current!==ticket||closed)return;
    await context.resume();if(context.state!=='running')throw new Error('Tap Listen again to enable audio on this device.');
    const buffer=context.createBuffer(1,audio.samples.length,audio.sampleRate);buffer.copyToChannel(audio.samples,0);
    await new Promise(resolve=>{releasePlayback=resolve;source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.onended=()=>{source?.disconnect();source=null;releasePlayback=null;resolve()};source.start();onState('speaking')});
   }
   if(current===ticket&&!closed)onState('idle');
  }catch(error){if(current!==ticket||closed)return;onState('idle');if(error.name!=='AbortError')onNotice(error.message||'Natural voice could not play. Tap Listen again to retry.')}
 };
 const speak=(text)=>{
  stop();if(closed||!text)return;
  if(english){unlock();speakNatural(String(text),++ticket);return}
  if(!synth){onNotice('Spoken audio is unavailable here. Captions and answers still work.');return}
  const selected=voice();
  if(!selected&&synth.getVoices().length){onNotice('This phone has no speaking voice for this language. Add a matching voice in iPhone settings, choose another language, or use captions.');return}
  const current=++ticket;utterance=new SpeechSynthesisUtterance(text);utterance.lang=locale;if(selected)utterance.voice=selected;utterance.rate=.94;utterance.pitch=1;
  utterance.onstart=()=>{if(current!==ticket||closed)return;clearTimeout(startTimer);onState('speaking')};
  const finish=()=>{if(current!==ticket||closed)return;clearTimeout(startTimer);clearTimeout(endTimer);utterance=null;onState('idle')};
  utterance.onend=finish;utterance.onerror=()=>{finish();onNotice('Tap Listen again to play the voice, or continue with the captions.')};
  startTimer=setTimeout(()=>{if(current===ticket&&!synth.speaking){stop();onNotice('Tap Listen again to enable spoken audio on this device.')}},4000);
  endTimer=setTimeout(()=>{if(current===ticket)stop()},Math.min(180000,Math.max(15000,text.length*130)));
  synth.speak(utterance);
 };
 const listen=()=>{
  stop();if(closed)return;
  if(!Recognition){onNotice('Voice input is unavailable in this browser. Open Uniworld in Safari, or use an answer chip or the keyboard.');return}
  const current=++ticket;recognizer=new Recognition();recognizer.lang=locale;recognizer.continuous=false;recognizer.interimResults=true;recognizer.maxAlternatives=1;
  recognizer.onstart=()=>{if(current===ticket&&!closed)onState('listening')};
  recognizer.onresult=event=>{if(current!==ticket||closed)return;let text='';for(let i=0;i<event.results.length;i++)text+=event.results[i][0].transcript+' ';onTranscript(text.trim())};
  recognizer.onerror=event=>{if(current!==ticket||closed)return;const messages={'not-allowed':'Microphone access was declined. Allow it in Safari website settings, or use the answer chips.','service-not-allowed':'Speech recognition is unavailable here. Try Safari with Siri enabled, or use the answer chips.','language-not-supported':'Voice input does not support this language on your device. Choose another language or use the keyboard.','audio-capture':'Your microphone is unavailable. Check its permission or use the answer chips.','no-speech':'I did not hear an answer. Tap the microphone to try again.','network':'The speech service could not connect. Check your connection and try again.'};if(event.error!=='aborted')onNotice(messages[event.error]||'Voice input stopped. Tap the microphone to try again.');onState('idle')};
  recognizer.onend=()=>{if(current===ticket&&!closed){recognizer=null;onState('idle');clearTimeout(endTimer)}};
  endTimer=setTimeout(()=>{if(current===ticket){recognizer?.stop()}},25000);
  try{recognizer.start()}catch{stop();onNotice('Microphone could not start. Tap again, or use an answer chip.')}
 };
 return {speak,listen,stop,unlock,finishListening:()=>recognizer?.stop(),supported:!!Recognition,hasVoice:()=>english?neuralVoiceReady():!!voice(),dispose:()=>{stop();closed=true;context?.close().catch(()=>{})}};
}
