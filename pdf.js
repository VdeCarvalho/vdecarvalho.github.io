/* Offline PDF export. Browser canvas preserves all eleven writing systems.
   Pages are embedded as high-resolution JPEG images; no data leaves the device. */
(function(root){
  const W=794,H=1123,M=48,BOTTOM=1050;
  function layouts(report,ctx){
    const pages=[];let page,y;
    function wrap(text,size,width,bold=false){
      ctx.font=`${bold?'bold ':''}${size}px Arial, sans-serif`;
      const out=[];let part='';
      const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(report.lang,{granularity:'grapheme'}).segment(String(text))].map(x=>x.segment):Array.from(String(text));
      for(const char of segments){
        if(char==='\n'){out.push(part);part='';continue;}
        if(ctx.measureText(part+char).width>width){const space=part.lastIndexOf(' ');if(space>part.length/2){out.push(part.slice(0,space));part=part.slice(space+1)+char;}else{out.push(part);part=char;}}
        else part+=char;
      }
      if(part)out.push(part);return out;
    }
    const noteLines=report.notes.flatMap(note=>[...wrap(note,11,W-2*M-32),'']);if(noteLines.at(-1)==='')noteLines.pop();
    const firstNotes=noteLines.slice(0,22),noteHeight=firstNotes.length?firstNotes.length*16+30:0,firstLimit=BOTTOM-noteHeight-24;
    function limit(){return pages.length===1?firstLimit:BOTTOM;}
    function fresh(){page=[];pages.push(page);y=100;}
    function line(text,size=15,color='#17343d',bold=false){
      for(const chunk of wrap(text,size,W-2*M,bold)){if(y+size*1.6>limit())fresh();page.push({type:'text',text:chunk,y,size,color,bold});y+=size*1.6;}
    }
    fresh();line(report.title,23,'#17343d',true);line(report.date,12,'#62777e');y+=16;
    if(report.primary){page.push({type:'hero',label:report.primary.label,value:report.primary.value,y,height:112});y+=132;}
    if(report.notice){const lines=wrap(report.notice,12,W-2*M-32),height=lines.length*18+24;if(y+height>limit())fresh();page.push({type:'notice',lines,y,height});y+=height+14;}
    report.summary.forEach(([label,value],i)=>{if(y+42>limit())fresh();page.push({type:'summary',label,value,y,height:42,striped:i%2===0});y+=42;});
    y+=22;
    if(report.inputs.length&&y+report.inputs.reduce((sum,block)=>sum+block.length*23+12,0)>limit())fresh();
    report.inputs.forEach(block=>{if(y+block.length*23+12>limit())fresh();block.forEach((text,i)=>line(text,i===0?15:13,'#17343d',i===0));y+=12;});
    if(firstNotes.length)pages[0].push({type:'notes',lines:firstNotes,y:BOTTOM-noteHeight,height:noteHeight});
    for(let start=22;start<noteLines.length;start+=45){fresh();const lines=noteLines.slice(start,start+45),height=lines.length*16+30;page.push({type:'notes',lines,y:BOTTOM-height,height});}
    for(const section of report.tables){
      fresh();line(section.title,20,'#17343d',true);y+=12;
      const widths=section.widths.map(x=>x*(W-2*M));
      const rowHeight=32;
      function header(){page.push({type:'row',values:section.headers,widths,y,header:true,height:42});y+=42;}
      header();
      for(const values of section.rows){if(y+rowHeight>BOTTOM){fresh();line(section.title,17,'#17343d',true);y+=8;header();}page.push({type:'row',values,widths,y,height:rowHeight});y+=rowHeight;}
    }
    return pages;
  }
  function paint(canvas,items,report,index,total){
    canvas.width=W*2;canvas.height=H*2;const c=canvas.getContext('2d');c.scale(2,2);c.fillStyle='white';c.fillRect(0,0,W,H);c.textBaseline='top';
    c.fillStyle='#17343d';c.font='bold 17px Arial, sans-serif';c.fillText('Loan Calculator',M,36);
    c.fillStyle='#dce5e8';c.fillRect(M,70,W-2*M,1);
    for(const item of items){
      if(item.type==='text'){c.direction=report.rtl?'rtl':'ltr';c.textAlign=report.rtl?'right':'left';c.fillStyle=item.color;c.font=`${item.bold?'bold ':''}${item.size}px Arial, sans-serif`;c.fillText(item.text,report.rtl?W-M:M,item.y);}
      else if(item.type==='hero'){
        c.fillStyle='#e7f5ee';c.fillRect(M,item.y,W-2*M,item.height);c.fillStyle='#318467';c.fillRect(report.rtl?W-M-4:M,item.y,4,item.height);
        c.direction=report.rtl?'rtl':'ltr';c.textAlign=report.rtl?'right':'left';const x=report.rtl?W-M-24:M+24;
        c.fillStyle='#386653';c.font='bold 15px Arial, sans-serif';c.fillText(item.label,x,item.y+20,W-2*M-48);
        let size=34;c.font=`bold ${size}px Arial, sans-serif`;while(c.measureText(item.value).width>W-2*M-48&&size>18){size--;c.font=`bold ${size}px Arial, sans-serif`;}
        c.fillStyle='#173d34';c.fillText(item.value,x,item.y+53,W-2*M-48);
      }
      else if(item.type==='summary'){
        c.fillStyle=item.striped?'#f3f6f7':'#fff';c.fillRect(M,item.y,W-2*M,item.height);
        c.direction=report.rtl?'rtl':'ltr';c.textAlign=report.rtl?'right':'left';c.font='13px Arial, sans-serif';c.fillStyle='#60757d';c.fillText(item.label,report.rtl?W-M-14:M+14,item.y+13,(W-2*M)*.45);
        c.textAlign=report.rtl?'left':'right';c.font='bold 15px Arial, sans-serif';c.fillStyle='#17343d';c.fillText(item.value,report.rtl?M+14:W-M-14,item.y+12,(W-2*M)*.5);
      }
      else if(item.type==='notice'){
        c.fillStyle='#fff7df';c.fillRect(M,item.y,W-2*M,item.height);c.fillStyle='#775413';c.font='12px Arial, sans-serif';c.direction=report.rtl?'rtl':'ltr';c.textAlign=report.rtl?'right':'left';item.lines.forEach((line,i)=>c.fillText(line,report.rtl?W-M-16:M+16,item.y+12+i*18));
      }
      else if(item.type==='notes'){
        c.fillStyle='#f3f6f7';c.fillRect(M,item.y,W-2*M,item.height);c.fillStyle='#d4dfe3';c.fillRect(M,item.y,W-2*M,1);
        c.direction=report.rtl?'rtl':'ltr';c.textAlign=report.rtl?'right':'left';c.fillStyle='#61737a';c.font='11px Arial, sans-serif';item.lines.forEach((line,i)=>c.fillText(line,report.rtl?W-M-16:M+16,item.y+15+i*16));
      }
      else {c.fillStyle=item.header?'#e7f5ee':'#f7f9fa';c.fillRect(M,item.y,W-2*M,item.height-1);let x=M;
        item.values.forEach((value,i)=>{const width=item.widths[i];c.save();c.beginPath();c.rect(x,item.y,width,item.height);c.clip();c.direction=report.rtl?'rtl':'ltr';c.textAlign='right';c.fillStyle='#17343d';let size=item.header?12:13;c.font=`${item.header?'bold ':''}${size}px Arial, sans-serif`;
          // Headers wrap; numeric cells fit within their own columns.
          if(item.header){const words=String(value).split(' ');let a='',lines=[];for(const word of words){if(c.measureText(a+' '+word).width>width-16&&a){lines.push(a);a=word;}else a+=(a?' ':'')+word;}lines.push(a);if(lines.length>2){size=10;c.font='bold 10px Arial, sans-serif';lines=[String(value)];}lines.slice(0,2).forEach((line,j)=>c.fillText(line,x+width-8,item.y+7+j*15,width-16));}
          else {while(c.measureText(String(value)).width>width-16&&size>9){size--;c.font=`${size}px Arial, sans-serif`;}c.fillText(String(value),x+width-8,item.y+9,width-16);}c.restore();x+=width;});
      }
    }
    c.direction='ltr';c.textAlign='center';c.fillStyle='#62777e';c.font='12px Arial, sans-serif';c.fillText(`${index+1} / ${total}`,W/2,H-38);
  }
  async function create(report){
    await document.fonts.ready;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),pages=layouts(report,ctx);
    const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
    const push=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);length+=bytes.length;};
    const obj=(id,body)=>{offsets[id]=length;push(`${id} 0 obj\n`);push(body);push('\nendobj\n');};
    push('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
    for(let i=0;i<pages.length;i++){
      paint(canvas,pages[i],report,i,pages.length);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));if(!blob)throw Error('PDF image encoding failed');const jpg=new Uint8Array(await blob.arrayBuffer());
      const pageId=3+i*3,imageId=pageId+1,contentId=pageId+2;
      obj(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.5 842.25] /Resources << /XObject << /Im ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      offsets[imageId]=length;push(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W*2} /Height ${H*2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);push(jpg);push('\nendstream\nendobj\n');
      const content='q\n595.5 0 0 842.25 0 0 cm\n/Im Do\nQ';obj(contentId,`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const xref=length;push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);offsets.slice(1).forEach(offset=>push(`${String(offset).padStart(10,'0')} 00000 n \n`));push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts,{type:'application/pdf'});
  }
  let lastURL;
  async function download(report){const blob=await create(report);if(lastURL)URL.revokeObjectURL(lastURL);const url=URL.createObjectURL(blob),link=document.createElement('a');lastURL=url;link.href=url;link.download='Loan-Calculator-study.pdf';link.id='download-pdf';link.className='calculate download';link.textContent=report.downloadLabel;const button=document.querySelector('#download-pdf');if(button)button.replaceWith(link);else document.body.append(link);link.click();}
  root.LoanPDF={create,download};
})(globalThis);
