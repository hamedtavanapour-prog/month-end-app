(function(root){
  const NUMS={
    zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
    eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,
    twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,
    a:1,an:1,couple:2,half:0.5,quarter:0.25
  };
  const NUMBER_WORDS='a|an|couple|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|half|quarter';
  const QUANTITY=`(?:[\\d.]+|(?:${NUMBER_WORDS})(?:[\\s-]+(?:${NUMBER_WORDS})){0,2})`;

  function wordsToNumber(value){
    if(!value)return null;
    let input=String(value).trim().toLowerCase().replace(/-/g,' ').replace(/^a\s+couple$/,'couple');
    const decimal=Number.parseFloat(input);
    if(!Number.isNaN(decimal))return decimal;
    if(input.includes('half'))return 0.5;
    if(input.includes('quarter'))return 0.25;
    let total=0,current=0,found=false;
    for(const word of input.split(/\s+/)){
      const number=NUMS[word];
      if(number===undefined)continue;
      found=true;
      if(word==='hundred')current=(current||1)*100;
      else current+=number;
    }
    total+=current;
    return found?total:null;
  }

  function commandOperation(value){
    const command=String(value||'').trim();
    const operations=[
      {operation:'subtract',pattern:/^(?:please\s+)?(?:take\s+away|deduct|remove|subtract|minus|decrease(?:\s+by)?)\s+/i},
      {operation:'add',pattern:/^(?:please\s+)?(?:add|plus|increase(?:\s+by)?|put\s+in|include|found(?:\s+another)?)\s+/i},
      {operation:'set',pattern:/^(?:please\s+)?(?:set|make|change(?:\s+to)?)\s+/i}
    ];
    for(const candidate of operations){
      if(candidate.pattern.test(command)){
        return{operation:candidate.operation,value:command.replace(candidate.pattern,'').replace(/^another\s+/i,'').trim()};
      }
    }
    return{operation:'set',value:command};
  }

  function parseVoice(text){
    const operationWords='add|plus|increase|put\s+in|include|found|take\s+away|deduct|remove|subtract|minus|decrease|set|make|change';
    const chunks=String(text||'')
      .replace(/\band then\b/gi,',')
      .replace(/\bthen\b/gi,',')
      .replace(new RegExp(`\\band\\s+(?=(?:${operationWords})\\b)`,'gi'),',')
      .replace(/[,;]+/g,',')
      .replace(/\s{2,}/g,' ')
      .trim()
      .split(',')
      .map(value=>value.trim())
      .filter(Boolean);
    const results=[];
    for(const rawChunk of chunks){
      const command=commandOperation(rawChunk);
      const chunk=command.value
        .replace(/^from\s+/i,'')
        .replace(/\s+off$/i,'')
        .replace(new RegExp(`^(.+?)\\s+by\\s+(${QUANTITY})$`,'i'),'$1 $2');
      const start=chunk.match(new RegExp(`^(${QUANTITY})\\s+(.+)$`,'i'));
      const end=chunk.match(new RegExp(`^(.+?)\\s+(${QUANTITY})$`,'i'));
      let name=null,quantityText='1';
      if(start){quantityText=start[1];name=start[2];}
      else if(end){name=end[1];quantityText=end[2];}
      else name=chunk;
      name=String(name||'').replace(/\bpar\b/gi,'').replace(/^from\s+/i,'').trim();
      if(!name)continue;
      const quantity=wordsToNumber(quantityText);
      results.push({nameStr:name,qty:quantity===null?1:quantity,operation:command.operation});
    }
    return results;
  }

  function applyCountOperation(currentValue,quantity,operation='set'){
    const current=Number.parseFloat(currentValue);
    const baseline=Number.isFinite(current)?current:0;
    const amount=Number.isFinite(Number(quantity))?Number(quantity):0;
    const next=operation==='add'?baseline+amount:operation==='subtract'?Math.max(0,baseline-amount):amount;
    return Number(next.toFixed(4));
  }

  root.MonthEndVoiceCommands={NUMS,wordsToNumber,parseVoice,applyCountOperation};
})(typeof globalThis!=='undefined'?globalThis:window);
