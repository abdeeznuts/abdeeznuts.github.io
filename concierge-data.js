export const languages=[
 {id:'en',locale:'en-GB',name:'English',native:'Hello, world.',dir:'ltr',sample:'Your next journey starts with a conversation.'},
 {id:'ur',locale:'ur-PK',name:'Urdu',native:'دنیا آپ کی منتظر ہے',dir:'rtl',sample:'آپ کا اگلا سفر ایک گفتگو سے شروع ہوتا ہے۔'},
 {id:'ar',locale:'ar-SA',name:'Arabic',native:'العالم بانتظارك',dir:'rtl',sample:'رحلتك القادمة تبدأ بمحادثة.'},
 {id:'es',locale:'es-ES',name:'Spanish',native:'El mundo te espera.',dir:'ltr',sample:'Tu próximo viaje empieza con una conversación.'}
];
export const fields=['destination','duration','party','budget','pace','interests'];
export const fieldLabels=['Your somewhere','Time away','Your company','Your budget','Your rhythm','Little details'];
const questions={
 en:['Where would you love to go? A city, a country, or even an Umrah journey.','When would you like to travel, and for how many days?','Who is coming with you? Tell me how many adults and children.','What budget feels comfortable? Include your currency and whether it is per person or for everyone.','How would you like this trip to feel: relaxed, balanced, or adventurous?','What would make this trip yours? Food, nature, beautiful hotels, family time, or anything I should consider?'],
 ur:['آپ کہاں جانا چاہیں گے؟ کوئی شہر، ملک، یا عمرہ کا سفر؟','آپ کب سفر کرنا چاہتے ہیں، اور کتنے دن کے لیے؟','آپ کے ساتھ کون جا رہا ہے؟ کتنے بڑے اور کتنے بچے؟','آپ کا بجٹ کیا ہے؟ کرنسی بتائیں اور یہ بھی کہ بجٹ فی شخص ہے یا سب کے لیے۔','آپ سفر کیسا چاہتے ہیں: آرام دہ، متوازن، یا مہم جوئی سے بھرپور؟','اس سفر میں آپ کے لیے کیا خاص ہے؟ کھانا، قدرتی مناظر، خوبصورت ہوٹل، خاندان، یا کوئی خاص ضرورت؟'],
 ar:['إلى أين تود السفر؟ مدينة، دولة، أم رحلة عمرة؟','متى تود السفر، ولكم يومًا؟','من سيسافر معك؟ كم عدد البالغين والأطفال؟','ما الميزانية المناسبة لك؟ اذكر العملة وهل هي للفرد أم للجميع.','كيف تفضل إيقاع الرحلة: هادئ، متوازن، أم مليء بالمغامرات؟','ما الذي يجعل هذه الرحلة مميزة لك؟ الطعام، الطبيعة، الفنادق الجميلة، وقت العائلة، أم احتياجات خاصة؟'],
 es:['¿Adónde te gustaría viajar? Una ciudad, un país o un viaje de Umrah.','¿Cuándo quieres viajar y por cuántos días?','¿Quién viaja contigo? ¿Cuántos adultos y niños?','¿Cuál es tu presupuesto? Incluye la moneda y si es por persona o para todo el grupo.','¿Prefieres un viaje relajado, equilibrado o aventurero?','¿Qué haría especial este viaje? Gastronomía, naturaleza, hoteles únicos, familia o alguna necesidad especial.']
};
export function questionFor(lang,step){return (questions[lang]||questions.en)[step]||''}
export const suggestions={
 en:[['Hunza, Pakistan','London, UK','New York, USA','Umrah · Makkah & Madinah'],['3 days · dates flexible','5 days · next month','7 days · dates flexible'],['Just me','2 adults','2 adults and 2 children'],['PKR 300,000 total','GBP 2,000 total','USD 3,000 total'],['Relaxed','Balanced','Adventurous'],['Nature & beautiful hotels','Food & local culture','Family time & easy access']],
 ur:[['ہنزہ، پاکستان','لندن، برطانیہ','نیویارک، امریکہ','عمرہ، مکہ اور مدینہ'],['3 دن، تاریخیں لچکدار','5 دن، اگلے مہینے','7 دن، تاریخیں لچکدار'],['صرف میں','2 بڑے','2 بڑے اور 2 بچے'],['کل 300,000 پاکستانی روپے','کل 2,000 برطانوی پاؤنڈ','کل 3,000 امریکی ڈالر'],['آرام دہ','متوازن','مہم جوئی'],['قدرتی مناظر اور خوبصورت ہوٹل','کھانا اور مقامی ثقافت','خاندان اور آسان رسائی']],
 ar:[['هونزا، باكستان','لندن، بريطانيا','نيويورك، أمريكا','عمرة، مكة والمدينة'],['3 أيام، تواريخ مرنة','5 أيام، الشهر القادم','7 أيام، تواريخ مرنة'],['بمفردي','بالغان','بالغان وطفلان'],['300,000 روبية باكستانية للجميع','2,000 جنيه إسترليني للجميع','3,000 دولار أمريكي للجميع'],['هادئ','متوازن','مغامرات'],['الطبيعة وفنادق مميزة','الطعام والثقافة المحلية','العائلة وسهولة الوصول']],
 es:[['Hunza, Pakistán','Londres, Reino Unido','Nueva York, EE. UU.','Umrah · La Meca y Medina'],['3 días · fechas flexibles','5 días · próximo mes','7 días · fechas flexibles'],['Solo yo','2 adultos','2 adultos y 2 niños'],['PKR 300.000 en total','GBP 2.000 en total','USD 3.000 en total'],['Relajado','Equilibrado','Aventurero'],['Naturaleza y hoteles únicos','Comida y cultura local','Familia y accesibilidad']]
};
export const copy={
 en:{listen:'Tap to speak',listening:'Listening to you…',thinking:'A little thought, just for you…',speaking:'Uniworld is speaking',next:'Use this answer',retry:'Try speaking again',review:'Your journey, taking shape.',ready:'I have the details. Let’s bring your journey to life.',build:'Create my journey',read:'Read my journey',done:'Your journey is ready. Let me walk you through it.'},
 ur:{listen:'بولنے کے لیے دبائیں',listening:'آپ کی بات سن رہے ہیں…',thinking:'آپ کے سفر پر غور کر رہے ہیں…',speaking:'یونی ورلڈ بول رہا ہے',next:'یہ جواب استعمال کریں',retry:'دوبارہ بولیں',review:'آپ کا سفر، آپ کے انداز میں',ready:'تفصیلات مل گئیں۔ آئیے آپ کا سفر ترتیب دیں۔',build:'میرا سفر بنائیں',read:'میرا سفر سنائیں',done:'آپ کے سفر کی تجویز تیار ہے۔ آئیے اسے سنیں۔'},
 ar:{listen:'اضغط للتحدث',listening:'نستمع إليك…',thinking:'نفكر في رحلتك…',speaking:'يوني ورلد يتحدث',next:'استخدم هذه الإجابة',retry:'تحدث مرة أخرى',review:'رحلتك تبدأ بالتشكل',ready:'أصبحت التفاصيل جاهزة. لنخطط رحلتك.',build:'خطط رحلتي',read:'اقرأ رحلتي',done:'اقتراح رحلتك جاهز. لنستعرضه معًا.'},
 es:{listen:'Toca para hablar',listening:'Te escuchamos…',thinking:'Imaginando tu viaje…',speaking:'Uniworld está hablando',next:'Usar esta respuesta',retry:'Hablar otra vez',review:'Tu viaje empieza a tomar forma.',ready:'Ya tengo los detalles. Vamos a dar forma a tu viaje.',build:'Crear mi viaje',read:'Leer mi viaje',done:'Tu viaje está listo. Vamos a descubrirlo.'}
};
export function tripDays(value=''){
 const normalized=value.replace(/[٠-٩۰-۹]/g,c=>'٠١٢٣٤٥٦٧٨٩'.includes(c)?String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)):String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
 const match=normalized.match(/\b(\d{1,2})\s*(?:day|night|día|dia)|([0-9]{1,2})\s*(?:دن|أيام|ايام|يوم)/i);
 const words={three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,week:7,تین:3,پانچ:5,سات:7,ثلاثة:3,خمسة:5,سبعة:7,tres:3,cinco:5,siete:7};
 const valueNumber=match?Number(match[1]||match[2]):Object.entries(words).find(([w])=>normalized.toLowerCase().includes(w))?.[1]||5;
 return Math.min(10,Math.max(2,valueNumber));
}
export function compactBrief(answers){return Object.fromEntries(fields.map(k=>[k,String(answers[k]||'').trim().slice(0,300)]))}
export function curatedVoicePlan(brief,lang){
 const d=tripDays(brief.duration),l=languages.find(x=>x.id===lang)||languages[0];
 const blocks={en:['Arrive, settle in, and explore nearby.','Choose one main experience and leave time to wander.','Keep a flexible final day and confirm your departure transfer.'],ur:['پہنچیں، آرام کریں اور آس پاس کی جگہیں دیکھیں۔','ایک اہم سرگرمی منتخب کریں اور آرام کا وقت رکھیں۔','آخری دن لچکدار رکھیں اور واپسی کے انتظامات کی تصدیق کریں۔'],ar:['الوصول والاستراحة واستكشاف المنطقة القريبة.','اختر تجربة رئيسية واحدة واترك وقتًا للراحة.','اترك اليوم الأخير مرنًا وأكد ترتيبات المغادرة.'],es:['Llega, descansa y explora los alrededores.','Elige una experiencia principal y deja tiempo libre.','Mantén flexible el último día y confirma tu traslado.']}[lang]||[];
 const dayLabel={en:'Day',ur:'دن',ar:'اليوم',es:'Día'}[lang];
 return {title:brief.destination||'Your next journey',source:'Guided template · no AI',language:l.locale,text:[[`${brief.destination} · ${d} days`,...fields.slice(1).map((k,i)=>`${fieldLabels[i+1]}: ${brief[k]}`)].join('\n'),...Array.from({length:d},(_,i)=>`${dayLabel} ${i+1}\n${blocks[i===0?0:i===d-1?2:1]}`)].join('\n\n')};
}
