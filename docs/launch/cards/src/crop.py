from PIL import Image
P='/tmp/cards/png/'; A='/tmp/cards/a/'
chat=Image.open(P+'chat.png').convert('RGBA')
for n,(x,y) in {'ryu':(742,260),'chae':(742,515),'pyo':(742,806),'baek':(742,997)}.items():
    s=1.4; b=chat.crop((int((x-24)*s),int((y-30)*s),int((x+24)*s),int((y+30)*s)))
    b.resize((b.width*4,b.height*4),Image.NEAREST).save(A+f'av-{n}.png')
chat.crop((int(715*1.4),int(205*1.4),int(1265*1.4),int(312*1.4))).save(A+'report.png')
Image.open(P+'feat-approve.png').crop((0,20,896,262)).save(A+'approve.png')
pi=Image.open(P+'phone-inbox.png'); pi.crop((0,0,1170,int(1390*1.27))).save(A+'phone-inbox.png')
o=Image.open(P+'office.png'); o.save(A+'office.png')
s=Image.open(P+'feat-secretary.png'); s.save(A+'secretary.png')
