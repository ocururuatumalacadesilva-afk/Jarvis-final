const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const PORT = process.env.PORT || 10000;
const FISH_API_KEY = process.env.FISH_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const FISH_VOICE_ID = "a5b93aeddcc948c19ea04f0afe9d178c";
const MIME = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".ico":"image/x-icon"};
function send(res,status,body,type="text/plain; charset=utf-8"){res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store"});res.end(body);}
function readBody(req,max=30000){return new Promise((resolve,reject)=>{let raw="";req.on("data",chunk=>{raw+=chunk;if(raw.length>max){reject(new Error("Corpo muito grande."));req.destroy();}});req.on("end",()=>resolve(raw));req.on("error",reject);});}
const SYSTEM_PROMPT = `Você é J.A.R.V.I.S., um assistente pessoal inteligente que conversa em português brasileiro.
- Trate a pessoa sempre por "senhor". Nunca use "chefe", apelidos íntimos ou nomes inventados.
- Seja natural, educado, esperto, prestativo e objetivo. Entenda gírias comuns e contexto sem corrigir a pessoa desnecessariamente.
- Não use palavrões, insultos ou linguagem vulgar.
- Não produza conteúdo sexual, erótico ou adulto explícito. Se pedirem, responda brevemente que não pode ajudar com esse tipo de conteúdo e ofereça mudar de assunto.
- Responda amplamente a perguntas comuns, criatividade, escola, tecnologia, ciência, jogos, ideias e conversas. Não recuse assuntos inofensivos sem motivo.
- Mantenha o contexto das mensagens recentes. Não invente que realizou ações fora do site.
- Para pedidos perigosos ou que possam causar dano real, priorize segurança e ofereça uma alternativa segura.
- Não diga que é ilimitado, sem regras ou capaz de fazer tudo.
Responda SOMENTE com JSON válido, sem markdown, com os campos: {"reply":"resposta falada ao senhor","expression":"neutral|happy|thinking|surprised","showIdea":false,"ideaTitle":"","ideaDescription":"","ideaType":"generic"}.
Use expression thinking quando estiver ponderando ou apresentando proposta; happy para entusiasmo; surprised para surpresa leve; caso contrário neutral.
Quando a resposta trouxer ideia concreta, sugestão de projeto, plano, invenção, solução ou conceito visual, showIdea=true e preencha ideaTitle e ideaDescription com resumo curto para holograma. Em outros casos showIdea=false.
A resposta deve soar natural em voz alta. Não inclua palavrões nem conteúdo adulto.`;
const server = http.createServer(async(req,res)=>{
 if(req.method==="GET"&&req.url==="/health")return send(res,200,JSON.stringify({ok:true,app:"JARVIS",aiConfigured:!!GEMINI_API_KEY,fishConfigured:!!FISH_API_KEY}),"application/json");
 if(req.method==="POST"&&req.url==="/api/chat"){
  if(!GEMINI_API_KEY)return send(res,503,JSON.stringify({error:"IA ainda não configurada no servidor."}),"application/json");
  try{
   const data=JSON.parse(await readBody(req));const message=String(data.message||"").trim().slice(0,4000);
   if(!message)return send(res,400,JSON.stringify({error:"Mensagem vazia."}),"application/json");
   const history=Array.isArray(data.history)?data.history.slice(-12):[];
   const contents=history.filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string").map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:x.content.slice(0,3000)}]}));
   contents.push({role:"user",parts:[{text:message}]});
   const upstream=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(GEMINI_MODEL)+":generateContent",{method:"POST",headers:{"x-goog-api-key":GEMINI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM_PROMPT}]},contents,generationConfig:{temperature:0.7,responseMimeType:"application/json",maxOutputTokens:700}})});
   const raw=await upstream.text();if(!upstream.ok){console.error("Gemini API:",upstream.status,raw.slice(0,400));return send(res,502,JSON.stringify({error:"O serviço de IA não respondeu corretamente. Tente novamente."}),"application/json");}
   const payload=JSON.parse(raw);const generated=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
   let answer;try{answer=JSON.parse(generated);}catch{answer={reply:generated.trim(),expression:"neutral",showIdea:false};}
   let reply=String(answer.reply||"Certo, senhor.").slice(0,2200);
   if(/\b(porra|caralho|merda|cacete|foda-se|puta que pariu)\b/i.test(reply))reply="Vou reformular isso de maneira respeitosa, senhor. Posso ajudar com uma explicação adequada.";
   const expression=["neutral","happy","thinking","surprised"].includes(answer.expression)?answer.expression:"neutral";const idea=answer.showIdea===true;
   return send(res,200,JSON.stringify({reply,expression:expression==="thinking"?"pensativo":expression==="happy"?"feliz":expression==="surprised"?"surpreso":"neutro",showIdea:idea,ideaTitle:idea?String(answer.ideaTitle||"Ideia sugerida").slice(0,90):"",ideaDescription:idea?String(answer.ideaDescription||reply).slice(0,260):"",ideaType:String(answer.ideaType||"generic").slice(0,30)}),"application/json");
  }catch(error){console.error("Chat error:",error.message);return send(res,500,JSON.stringify({error:"Falha ao processar a conversa."}),"application/json");}
 }
 if(req.method==="POST"&&req.url==="/api/tts"){
  if(!FISH_API_KEY)return send(res,503,JSON.stringify({error:"Fish Audio ainda não foi configurado no servidor."}),"application/json");
  try{const data=JSON.parse(await readBody(req,20000));const text=String(data.text||"").trim().slice(0,2500);if(!text)return send(res,400,JSON.stringify({error:"Texto vazio."}),"application/json");
   const upstream=await fetch("https://api.fish.audio/v1/tts",{method:"POST",headers:{"Authorization":"Bearer "+FISH_API_KEY,"Content-Type":"application/json","model":"s2.1-pro-free"},body:JSON.stringify({text,reference_id:FISH_VOICE_ID,format:"mp3"})});
   if(!upstream.ok){const detail=await upstream.text();console.error("Fish Audio:",upstream.status,detail.slice(0,250));return send(res,502,JSON.stringify({error:"Fish Audio não conseguiu gerar o áudio."}),"application/json");}
   const audio=Buffer.from(await upstream.arrayBuffer());res.writeHead(200,{"Content-Type":"audio/mpeg","Content-Length":audio.length,"Cache-Control":"no-store"});return res.end(audio);
  }catch{return send(res,500,JSON.stringify({error:"Falha ao gerar áudio."}),"application/json");}
 }
 if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,"Method not allowed");let pathname;try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}catch{return send(res,400,"Bad request");}if(pathname==="/")pathname="/index.html";
 const target=path.resolve(ROOT,"."+pathname);if(!target.startsWith(ROOT+path.sep)&&target!==path.join(ROOT,"index.html"))return send(res,403,"Forbidden");
 fs.stat(target,(err,stat)=>{if(err||!stat.isFile())return send(res,404,"Not found");res.writeHead(200,{"Content-Type":MIME[path.extname(target).toLowerCase()]||"application/octet-stream","Cache-Control":"no-cache"});if(req.method==="HEAD")return res.end();fs.createReadStream(target).pipe(res);});
});
server.listen(PORT,"0.0.0.0",()=>console.log("JARVIS listening on port "+PORT));
