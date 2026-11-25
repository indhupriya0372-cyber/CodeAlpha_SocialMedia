const{DatabaseSync}=require('node:sqlite');
const express=require('express'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const db=new DatabaseSync('vibe.db'),SECRET=process.env.JWT_SECRET||'dev-secret-change-me';
fs.mkdirSync('uploads',{recursive:true});
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE,name TEXT,password TEXT,bio TEXT DEFAULT '',avatar TEXT DEFAULT '',created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY,user_id INT,caption TEXT DEFAULT '',media TEXT DEFAULT '',type TEXT DEFAULT 'text',created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS likes(user_id INT,post_id INT,PRIMARY KEY(user_id,post_id));
CREATE TABLE IF NOT EXISTS saves(user_id INT,post_id INT,PRIMARY KEY(user_id,post_id));
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY,post_id INT,user_id INT,text TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS follows(follower_id INT,following_id INT,PRIMARY KEY(follower_id,following_id));
CREATE TABLE IF NOT EXISTS stories(id INTEGER PRIMARY KEY,user_id INT,media TEXT,type TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS story_views(story_id INT,user_id INT,PRIMARY KEY(story_id,user_id));
CREATE TABLE IF NOT EXISTS notes(user_id INTEGER PRIMARY KEY,text TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,from_id INT,to_id INT,text TEXT DEFAULT '',media TEXT DEFAULT '',mtype TEXT DEFAULT '',post_id INT,seen INT DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifs(id INTEGER PRIMARY KEY,user_id INT,actor_id INT,type TEXT,post_id INT,seen INT DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);`);
const g=(q,...a)=>db.prepare(q).get(...a),all=(q,...a)=>db.prepare(q).all(...a),run=(q,...a)=>db.prepare(q).run(...a),err=(s,c,m)=>s.status(c).json({error:m});
if(!g('SELECT 1 FROM users LIMIT 1')){const h=bcrypt.hashSync('demo123',10);
  [['maria','Maria Lopez','Coffee, books and sunsets ☕','Out for a sunrise run 🌅','Good morning everyone! Make today count ✨'],['arjun','Arjun Mehta','Cricket • Code • Chai','Match day! 🏏','Weekend plans: nothing but chai and cricket 🏏'],
   ['priya','Priya Nair','Designer in Chennai ✨','New logo project 🎨','Started a new design sprint today 🎨'],['rahul','Rahul Verma','Travel and food 🍜','Biryani time 😋','Best street food in Chennai? Drop your picks 👇']].forEach(u=>{
    const id=Number(run('INSERT INTO users(username,name,password,bio) VALUES(?,?,?,?)',u[0],u[1],h,u[2]).lastInsertRowid);
    run('INSERT INTO notes(user_id,text) VALUES(?,?)',id,u[3]);run('INSERT INTO posts(user_id,caption) VALUES(?,?)',id,u[4])})}
const DEMO=['maria','arjun','priya','rahul'];
function seedSamples(){
  const ids=Object.fromEntries(DEMO.map(n=>[n,g('SELECT id FROM users WHERE username=?',n)?.id]));if(!ids.maria)return;
  if(!g("SELECT 1 FROM posts WHERE media LIKE '/samples/%'")){
    [['maria','sunset1','Golden hour never gets old 🌅 #sunset'],['arjun','city1','The city never sleeps 🌃'],['priya','art1','Colour study no.1: playing with warm tones 🎨'],['rahul','forest1','Lost in the pines 🌲 #travel'],
     ['maria','ocean1','Sea breeze and slow mornings 🌊'],['priya','art2','Colour study no.2 💚💛'],['arjun','city2','Night walk with chai ☕'],['rahul','desert1','Dune chasing in Rajasthan 🏜️'],
     ['maria','sunset2','Pastel skies on the way home ✨'],['priya','art3','New wallpaper drop 🎨 which one is your favourite?'],['rahul','ocean2','Chennai beach evenings are unmatched 🌴'],['arjun','forest2','Weekend trek with the team 🥾'],['rahul','desert2','Warm light, warm tea ☀️']
    ].forEach((p,i)=>run("INSERT INTO posts(user_id,caption,media,type,created) VALUES(?,?,?,'image',datetime('now',?))",ids[p[0]],p[2],`/samples/${p[1]}.jpg`,`-${(i+1)*5} hours`));
    run("UPDATE posts SET created=datetime('now','-2 days') WHERE media='' AND caption IN(?,?,?,?)",'Good morning everyone! Make today count ✨','Weekend plans: nothing but chai and cricket 🏏','Started a new design sprint today 🎨','Best street food in Chennai? Drop your picks 👇');
    const ps=all("SELECT id,user_id FROM posts WHERE media LIKE '/samples/%'"),us=Object.values(ids),C=['Love this! 😍','Stunning shot 🔥','This made my day ✨','Wow, where is this?','So good! 👏'];
    ps.forEach((p,i)=>{us.filter((u,k)=>u!=p.user_id&&(i+k)%3!=0).forEach(u=>run('INSERT OR IGNORE INTO likes VALUES(?,?)',u,p.id));
      if(i%2==0)run('INSERT INTO comments(post_id,user_id,text) VALUES(?,?,?)',p.id,us.filter(x=>x!=p.user_id)[i%3],C[i%C.length])});
    us.forEach(a=>us.forEach(b=>a!=b&&run('INSERT OR IGNORE INTO follows VALUES(?,?)',a,b)))}
  if(!g("SELECT 1 FROM stories WHERE media LIKE '/samples/%' AND created>datetime('now','-20 hours')")){
    run("DELETE FROM stories WHERE media LIKE '/samples/%'");
    [['maria','story1'],['maria','story3'],['arjun','story2'],['priya','story6'],['rahul','story5'],['rahul','story4']].forEach((x,i)=>run("INSERT INTO stories(user_id,media,type,created) VALUES(?,?,'image',datetime('now',?))",ids[x[0]],`/samples/${x[1]}.jpg`,`-${i+1} hours`));
    DEMO.forEach(n=>run('UPDATE notes SET created=CURRENT_TIMESTAMP WHERE user_id=?',ids[n]))}}
seedSamples();setInterval(seedSamples,36e5);
const app=express();app.use(express.json(),express.static('public'));
app.use('/uploads',express.static('uploads'));
const sign=id=>jwt.sign({id},SECRET,{expiresIn:'30d'});
const auth=(q,s,n)=>{let id;try{id=jwt.verify((q.headers.authorization||'').slice(7),SECRET).id}catch{}
  if(!id||!g('SELECT 1 FROM users WHERE id=?',id))return err(s,401,'Please log in');q.uid=id;n()};
const clients=new Map(),push=(id,ev)=>(clients.get(id)||[]).forEach(r=>r.write(`event: ${ev}\ndata: {}\n\n`));
function notify(to,by,type,post){if(to==by)return;run('INSERT INTO notifs(user_id,actor_id,type,post_id) VALUES(?,?,?,?)',to,by,type,post||null);push(to,'notif')}
app.get('/api/stream',(q,s)=>{let id;try{id=jwt.verify(String(q.query.t),SECRET).id}catch{return s.status(401).end()}
  s.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});s.flushHeaders&&s.flushHeaders();s.write('retry: 3000\n\n');
  if(!clients.has(id))clients.set(id,new Set());clients.get(id).add(s);q.on('close',()=>clients.get(id).delete(s))});
// ---- auth & profile ----
app.post('/api/register',(q,s)=>{const{username,name,password}=q.body;
  if(!/^[a-z0-9_.]{3,20}$/i.test(username||''))return err(s,400,'Username must be 3-20 characters: letters, numbers, _ or .');
  if((password||'').length<6)return err(s,400,'Password must be at least 6 characters');
  if(g('SELECT 1 FROM users WHERE username=?',username))return err(s,400,'That username is taken');
  s.json({token:sign(Number(run('INSERT INTO users(username,name,password) VALUES(?,?,?)',username,String(name||username).slice(0,40),bcrypt.hashSync(password,10)).lastInsertRowid))})});
app.post('/api/login',(q,s)=>{const u=g('SELECT * FROM users WHERE username=?',String(q.body.username||''));
  if(!u||!bcrypt.compareSync(q.body.password||'',u.password))return err(s,401,'Wrong username or password');s.json({token:sign(u.id)})});
app.get('/api/me',auth,(q,s)=>s.json(g('SELECT id,username,name,bio,avatar FROM users WHERE id=?',q.uid)));
app.put('/api/me',auth,(q,s)=>{const{name,bio,avatar}=q.body;
  run('UPDATE users SET name=?,bio=?,avatar=COALESCE(?,avatar) WHERE id=?',String(name||'').slice(0,40),String(bio||'').slice(0,150),avatar&&String(avatar).startsWith('/uploads/')?avatar:null,q.uid);s.json({ok:1})});
const EXT={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
app.post('/api/upload',auth,express.raw({type:()=>true,limit:'50mb'}),(q,s)=>{const t=(q.headers['content-type']||'').split(';')[0],e=EXT[t];
  if(!e||!Buffer.isBuffer(q.body)||!q.body.length)return err(s,400,'Upload a JPG, PNG, GIF, WEBP, MP4 or WEBM file (max 50 MB)');
  const f=crypto.randomBytes(12).toString('hex')+'.'+e;fs.writeFileSync(path.join('uploads',f),q.body);s.json({url:'/uploads/'+f,type:t.startsWith('video')?'video':'image'})});
app.get('/api/users',auth,(q,s)=>{const t=String(q.query.search||'').trim();
  s.json(t?all('SELECT id,username,name,avatar,EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=users.id) following FROM users WHERE id!=? AND (username LIKE ? OR name LIKE ?) LIMIT 20',q.uid,q.uid,'%'+t+'%','%'+t+'%')
    :all('SELECT u.id,u.username,u.name,u.avatar,1 following FROM follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=? LIMIT 30',q.uid))});
app.get('/api/suggestions',auth,(q,s)=>s.json(all('SELECT id,username,name,avatar FROM users WHERE id!=? AND id NOT IN(SELECT following_id FROM follows WHERE follower_id=?) ORDER BY id DESC LIMIT 8',q.uid,q.uid)));
const PQ=`SELECT p.id,p.caption,p.media,p.type,p.created,p.user_id,u.username,u.name,u.avatar,(SELECT COUNT(*) FROM likes WHERE post_id=p.id) likes,(SELECT COUNT(*) FROM comments WHERE post_id=p.id) comments,EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) liked,EXISTS(SELECT 1 FROM saves WHERE post_id=p.id AND user_id=?) saved FROM posts p JOIN users u ON u.id=p.user_id`;
const LIVE="created>datetime('now','-1 day')";
app.get('/api/u/:name',auth,(q,s)=>{const u=g('SELECT id,username,name,bio,avatar,created FROM users WHERE username=?',q.params.name);if(!u)return err(s,404,'User not found');
  const n=(c,v)=>g(`SELECT COUNT(*) c FROM follows WHERE ${c}=?`,v).c;
  s.json({...u,followers:n('following_id',u.id),following:n('follower_id',u.id),isFollowing:!!g('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',q.uid,u.id),
    note:g(`SELECT text FROM notes WHERE user_id=? AND ${LIVE}`,u.id)?.text||'',posts:all(PQ+' WHERE p.user_id=? ORDER BY p.created DESC,p.id DESC',q.uid,q.uid,u.id)})});
app.post('/api/follow/:id',auth,(q,s)=>{const id=Number(q.params.id)||0;if(id==q.uid||!g('SELECT 1 FROM users WHERE id=?',id))return err(s,400,'Invalid user');
  if(run('DELETE FROM follows WHERE follower_id=? AND following_id=?',q.uid,id).changes==0){run('INSERT INTO follows VALUES(?,?)',q.uid,id);notify(id,q.uid,'follow')}s.json({ok:1})});
// ---- posts ----
app.post('/api/posts',auth,(q,s)=>{const{caption,media,type}=q.body,m=String(media||'');
  if(m&&!m.startsWith('/uploads/'))return err(s,400,'Invalid media');
  if(!m&&!String(caption||'').trim())return err(s,400,'Add a photo, video or some text');
  const id=Number(run('INSERT INTO posts(user_id,caption,media,type) VALUES(?,?,?,?)',q.uid,String(caption||'').slice(0,500),m,m?(type=='video'?'video':'image'):'text').lastInsertRowid);
  all('SELECT follower_id f FROM follows WHERE following_id=?',q.uid).forEach(r=>push(r.f,'feed'));s.json({id})});
app.get('/api/feed',auth,(q,s)=>{const O=' ORDER BY p.created DESC,p.id DESC';
  if(q.query.mode=='explore')return s.json(all(PQ+O+' LIMIT 60',q.uid,q.uid));
  let r=all(PQ+' WHERE p.user_id=? OR p.user_id IN(SELECT following_id FROM follows WHERE follower_id=?)'+O+' LIMIT 60',q.uid,q.uid,q.uid,q.uid);
  if(r.length<10){const have=new Set(r.map(p=>p.id));r=r.concat(all(PQ+O+' LIMIT 40',q.uid,q.uid).filter(p=>!have.has(p.id)));r.sort((a,b)=>b.created.localeCompare(a.created)||b.id-a.id)}
  s.json(r)});
app.get('/api/saved',auth,(q,s)=>s.json(all(PQ+' WHERE p.id IN(SELECT post_id FROM saves WHERE user_id=?) ORDER BY p.created DESC,p.id DESC',q.uid,q.uid,q.uid)));
app.get('/api/posts/:id',auth,(q,s)=>{const p=g(PQ+' WHERE p.id=?',q.uid,q.uid,Number(q.params.id)||0);p?s.json(p):err(s,404,'Post not found')});
app.delete('/api/posts/:id',auth,(q,s)=>{const id=Number(q.params.id)||0;
  if(run('DELETE FROM posts WHERE id=? AND user_id=?',id,q.uid).changes)['likes','saves','comments'].forEach(t=>run(`DELETE FROM ${t} WHERE post_id=?`,id));s.json({ok:1})});
const toggle=(t,q,s,ev)=>{const id=Number(q.params.id)||0,p=g('SELECT user_id FROM posts WHERE id=?',id);if(!p)return err(s,404,'Post not found');
  if(run(`DELETE FROM ${t} WHERE user_id=? AND post_id=?`,q.uid,id).changes==0){run(`INSERT INTO ${t} VALUES(?,?)`,q.uid,id);if(ev)notify(p.user_id,q.uid,ev,id)}s.json({ok:1})};
app.post('/api/posts/:id/like',auth,(q,s)=>toggle('likes',q,s,'like'));
app.post('/api/posts/:id/save',auth,(q,s)=>toggle('saves',q,s));
app.get('/api/posts/:id/comments',auth,(q,s)=>s.json(all('SELECT c.id,c.text,c.created,c.user_id,u.username,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE post_id=? ORDER BY c.id',Number(q.params.id)||0)));
app.post('/api/posts/:id/comments',auth,(q,s)=>{const id=Number(q.params.id)||0,t=String(q.body.text||'').trim().slice(0,300),p=g('SELECT user_id FROM posts WHERE id=?',id);
  if(!p)return err(s,404,'Post not found');if(!t)return err(s,400,'Comment cannot be empty');
  run('INSERT INTO comments(post_id,user_id,text) VALUES(?,?,?)',id,q.uid,t);notify(p.user_id,q.uid,'comment',id);s.json({ok:1})});
app.delete('/api/comments/:id',auth,(q,s)=>{const c=g('SELECT c.id,c.user_id,p.user_id owner FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?',Number(q.params.id)||0);
  if(c&&(c.user_id==q.uid||c.owner==q.uid))run('DELETE FROM comments WHERE id=?',c.id);s.json({ok:1})});
// ---- stories & notes ----
app.post('/api/stories',auth,(q,s)=>{const m=String(q.body.media||'');if(!m.startsWith('/uploads/'))return err(s,400,'Choose a photo or video');
  run('INSERT INTO stories(user_id,media,type) VALUES(?,?,?)',q.uid,m,q.body.type=='video'?'video':'image');s.json({ok:1})});
app.get('/api/stories',auth,(q,s)=>{
  const tray=all(`SELECT id,username,name,avatar,EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=users.id) fl FROM users WHERE id=? OR id IN(SELECT following_id FROM follows WHERE follower_id=?) OR id IN(SELECT user_id FROM stories WHERE ${LIVE}) OR id IN(SELECT user_id FROM notes WHERE ${LIVE})`,q.uid,q.uid,q.uid).map(u=>({...u,
    note:g(`SELECT text FROM notes WHERE user_id=? AND ${LIVE}`,u.id)?.text||'',
    stories:all(`SELECT id,media,type,created,EXISTS(SELECT 1 FROM story_views WHERE story_id=stories.id AND user_id=?) seen FROM stories WHERE user_id=? AND ${LIVE} ORDER BY id`,q.uid,u.id)}))
    .filter(u=>u.id==q.uid||u.stories.length||u.note);
  tray.forEach(u=>u.allSeen=u.stories.length>0&&u.stories.every(x=>x.seen));
  tray.sort((a,b)=>(b.id==q.uid)-(a.id==q.uid)||(b.fl-a.fl)||(a.allSeen-b.allSeen));s.json(tray)});
app.post('/api/stories/:id/view',auth,(q,s)=>{const id=Number(q.params.id)||0,st=g('SELECT user_id FROM stories WHERE id=?',id);
  if(st&&st.user_id!=q.uid)run('INSERT OR IGNORE INTO story_views VALUES(?,?)',id,q.uid);s.json({ok:1})});
app.get('/api/stories/:id/views',auth,(q,s)=>s.json(all('SELECT u.username,u.name,u.avatar FROM story_views v JOIN users u ON u.id=v.user_id JOIN stories st ON st.id=v.story_id WHERE v.story_id=? AND st.user_id=?',Number(q.params.id)||0,q.uid)));
app.delete('/api/stories/:id',auth,(q,s)=>{run('DELETE FROM stories WHERE id=? AND user_id=?',Number(q.params.id)||0,q.uid);s.json({ok:1})});
app.put('/api/note',auth,(q,s)=>{const t=String(q.body.text||'').trim().slice(0,60);
  t?run('INSERT INTO notes(user_id,text) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET text=excluded.text,created=CURRENT_TIMESTAMP',q.uid,t):run('DELETE FROM notes WHERE user_id=?',q.uid);s.json({ok:1})});
// ---- chat ----
const MSG=`SELECT m.*,(SELECT json_object('id',p.id,'caption',p.caption,'media',p.media,'type',p.type,'username',u.username) FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=m.post_id) post FROM messages m`;
const fix=m=>({...m,post:m.post?JSON.parse(m.post):null});
app.get('/api/chats',auth,(q,s)=>{const ids=all('SELECT DISTINCT CASE WHEN from_id=? THEN to_id ELSE from_id END o FROM messages WHERE from_id=? OR to_id=?',q.uid,q.uid,q.uid).map(r=>r.o);
  s.json(ids.map(o=>{const u=g('SELECT id,username,name,avatar FROM users WHERE id=?',o);if(!u)return null;
    return{...u,last:g('SELECT id,text,media,post_id,from_id,created FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id DESC LIMIT 1',q.uid,o,o,q.uid),
      unread:g('SELECT COUNT(*) c FROM messages WHERE from_id=? AND to_id=? AND seen=0',o,q.uid).c}}).filter(Boolean).sort((a,b)=>b.last.id-a.last.id))});
app.get('/api/messages/:name',auth,(q,s)=>{const o=g('SELECT id,username,name,avatar FROM users WHERE username=?',q.params.name);if(!o)return err(s,404,'User not found');
  if(run('UPDATE messages SET seen=1 WHERE from_id=? AND to_id=? AND seen=0',o.id,q.uid).changes)push(o.id,'read');
  s.json({user:o,messages:all(MSG+' WHERE (m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?) ORDER BY m.id',q.uid,o.id,o.id,q.uid).map(fix)})});
app.post('/api/messages/:name',auth,(q,s)=>{const o=g('SELECT id FROM users WHERE username=?',q.params.name);if(!o||o.id==q.uid)return err(s,400,'Invalid user');
  const t=String(q.body.text||'').trim().slice(0,1000),m=String(q.body.media||''),pid=Number(q.body.post_id)||null;
  if(m&&!m.startsWith('/uploads/'))return err(s,400,'Invalid media');if(!t&&!m&&!pid)return err(s,400,'Message is empty');
  const r=run('INSERT INTO messages(from_id,to_id,text,media,mtype,post_id) VALUES(?,?,?,?,?,?)',q.uid,o.id,t,m,m?(q.body.mtype=='video'?'video':'image'):'',pid);push(o.id,'msg');s.json({id:Number(r.lastInsertRowid)})});
app.get('/api/notifs',auth,(q,s)=>{const r=all('SELECT n.id,n.type,n.post_id,n.seen,n.created,u.username,u.avatar FROM notifs n JOIN users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 50',q.uid);
  run('UPDATE notifs SET seen=1 WHERE user_id=?',q.uid);s.json(r)});
app.get('/api/counts',auth,(q,s)=>s.json({notifs:g('SELECT COUNT(*) c FROM notifs WHERE user_id=? AND seen=0',q.uid).c,messages:g('SELECT COUNT(*) c FROM messages WHERE to_id=? AND seen=0',q.uid).c}));
app.listen(3000,()=>console.log('Vibe is running on http://localhost:3000'));
