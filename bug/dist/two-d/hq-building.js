// Street-facing elevation based on the supplied DFINITY office reference:
// five white-framed office rows, charcoal bands and a glazed ground floor.
export function buildingLayout(x, ground, scale) {
  const height = 34 * scale, width = 64 * scale, roof = ground - height;
  const left = x - width * .79, frontWidth = width * .86;
  const rowOffsets = [.045, .24, .38, .52, .66], windows = [];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 10; col++) windows.push({
    x: left + frontWidth * (.022 + col * .097),
    y: roof + height * rowOffsets[row],
    w: frontWidth * .088, h: height * .102, row, col
  });
  return { left, roof, width, frontWidth, height, ground, rowOffsets, windows };
}

function infinityMark(c, x, y, width) {
  const colors = ['#f4933d', '#ec497d', '#a851ad', '#487dcb', '#35a3db', '#457dd0'];
  c.lineWidth = Math.max(2, width * .13); c.lineCap = 'round';
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2, b = (i + 1) / 36 * Math.PI * 2;
    c.beginPath(); c.moveTo(x + Math.sin(a) * width / 2, y + Math.sin(a * 2) * width * .21);
    c.lineTo(x + Math.sin(b) * width / 2, y + Math.sin(b * 2) * width * .21);
    c.strokeStyle = colors[Math.floor(i / 6)]; c.stroke();
  }
}

export function drawDfinityBuilding(view) {
  const c = view.ctx, b = buildingLayout(view.screen(0, 0)[0], view.ground, view.scale);
  const { left, roof, width, frontWidth, height, ground } = b, corner = left + frontWidth;
  const rect = (x, y, w, h, color) => view.rect(x, y, w, h, color);
  const quad = (points, color) => { c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fillStyle=color;c.fill(); };
  rect(left, roof, frontWidth, height, '#343d4b');
  quad([[corner,roof],[left+width,roof+height*.045],[left+width,ground],[corner,ground]], '#b0b2ab');
  // The pale side façade recedes from the same corner and ends on the same street.
  for(let row=0;row<5;row++) {
    const y = roof+height*b.rowOffsets[row], wh=height*.102;
    quad([[corner,y],[left+width,y+height*.037],[left+width,y+wh+height*.037],[corner,y+wh]], '#d8dfd7');
    for(let col=0;col<3;col++) {
      const x=corner+(width-frontWidth)*(.08+col*.31), w=(width-frontWidth)*.23, shift=height*.037*(col+.5)/3;
      rect(x,y+shift+2,w,wh-3,'#617b83');rect(x+w*.48,y+shift+2,Math.max(1,view.scale*.2),wh-3,'#c8d5ce');
    }
  }
  const frame = Math.max(1.4, view.scale * .3);
  for(const w of b.windows) {
    rect(w.x-frame,w.y-frame,w.w+frame*2,w.h+frame*2,'#d3dedd');
    rect(w.x,w.y,w.w,w.h,w.row>2?'#687a84':'#688ba5');
    rect(w.x+w.w*.48,w.y,frame,w.h,'#e0e7df');
    // Lower glazing reflects the warm neighbouring masonry in the reference.
    if(w.row>2)rect(w.x+1,w.y+w.h*.3,w.w*.4,w.h*.65,(w.col+w.row)%3?'#8b827d':'#a49b8d');
    else rect(w.x+1,w.y+1,w.w*.39,w.h*.48,'#89a4b7');
    if((w.col+w.row*2)%7===0)rect(w.x+w.w*.55,w.y+1,w.w*.42,w.h*.24,'#304754');
    rect(w.x-frame,w.y+w.h,w.w+frame*2,frame,'#f0ebe0');
  }
  // Flat dark roof cap; no fictional flag or oversized signboard.
  rect(left-2,roof-4,frontWidth+4,5,'#202b38');
  rect(left,roof+1,frontWidth,2,'#6c7d8a');
  const logoX=left+frontWidth*.66,logoY=roof+height*.179,logoWidth=frontWidth*.105;
  infinityMark(c,logoX,logoY,logoWidth);
  view.text('D F I N I T Y',logoX+logoWidth*.68,logoY-height*.022,'#e2e6e6',Math.max(5,view.scale*1.65));
  const floorY=roof+height*.802,floorH=ground-floorY;
  rect(left,floorY,frontWidth,floorH,'#b8bcb8');
  rect(left,floorY-3,frontWidth,4,'#242c34');
  for(let bay=0;bay<5;bay++) {
    const x=left+frontWidth*(.025+bay*.197),w=frontWidth*.164;
    rect(x,floorY+floorH*.14,w,floorH*.72,'#33414b');
    rect(x+2,floorY+floorH*.18,w*.42,floorH*.36,'#71808a');
    rect(x+w*.48,floorY+floorH*.14,frame,floorH*.72,'#d8dfd8');
    rect(x-1,floorY+floorH*.87,w+2,2,'#e0ded3');
  }
  const doorX=left+frontWidth*.418;
  rect(doorX,floorY+floorH*.08,frontWidth*.107,floorH*.92,'#202e39');
  rect(doorX+frontWidth*.013,floorY+floorH*.17,frontWidth*.059,floorH*.78,'#b17d4b');
  rect(doorX+frontWidth*.063,floorY+floorH*.52,1.5,floorH*.17,'#e4cc9e');
  infinityMark(c,doorX+frontWidth*.086,floorY+floorH*.33,frontWidth*.026);
  rect(corner,floorY,width-frontWidth,floorH,'#bbc0b7');
  rect(corner+3,floorY+floorH*.15,width-frontWidth-7,floorH*.64,'#5a737b');
  rect(left-4,ground-3,width+8,3,'#d4d6cb');
}
