# usage: python3 tools/montage.py out.png title1:prefix1 title2:prefix2 ...   (rows of frames; prints pink-pixel measurements)
import sys
from PIL import Image, ImageDraw
import numpy as np
import glob,re,os
out=sys.argv[1]; rows=[a.rsplit(':',1) for a in sys.argv[2:]]
def frames(prefix):
    fs=glob.glob(prefix+'_*.png')
    key=lambda f:(-1 if '0_before' in f else float(re.search(r'_t([0-9p]+)\.png',f).group(1).replace('p','.')))
    return [os.path.basename(f)[len(os.path.basename(prefix))+1:-4] for f in sorted(fs,key=key)]
names=frames(rows[0][1])
def pink_box(im):
    a=np.asarray(im.convert('RGB')).astype(int); r,g,b=a[...,0],a[...,1],a[...,2]
    m=(r>g+45)&(r>b+5)&(r>110)          # pink/mauve pixels (blue/gray/platform have r<=g or r<=b)
    ys,xs=np.where(m)
    return None if len(xs)==0 else (xs.min(),xs.max(),ys.min(),ys.max(),int(m.sum()))
tw,th=300,178
sheet=Image.new('RGB',(tw*len(names),(th+16)*len(rows)),'white'); d=ImageDraw.Draw(sheet)
for r,(title,prefix) in enumerate(rows):
    d.text((4,r*(th+16)+2),title,fill='black')
    for c,n in enumerate(names):
        try: im=Image.open(f'{prefix}_{n}.png')
        except FileNotFoundError: continue
        sheet.paste(im.resize((tw,th)),(c*tw,r*(th+16)+16)); d.text((c*tw+4,r*(th+16)+18),n,fill='black')
        pb=pink_box(im)
        if pb: print(f'{title[:38]:38s} {n:9s} pink bbox w={pb[1]-pb[0]+1:4d} h={pb[3]-pb[2]+1:4d} area={pb[4]:6d}')
sheet.save(out)
