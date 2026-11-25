# CodeAlpha_SocialMedia (Vibe)
Full-stack social media platform inspired by Instagram, Facebook and WhatsApp.

## Features
- Username + password sign-up/login (no email), JWT + bcrypt
- Profiles with photo, bio, post grid, followers/following
- Photo, video and text posts; like (double-tap), comment, save, delete
- Share posts: copy link or send to a friend in chat
- Stories (photo/video, 24 hours, viewer with progress bars, view counts)
- Notes (short 24-hour status above the avatar)
- Direct messages: text, photos, videos, shared posts, real-time delivery and seen ticks
- Notifications (likes, comments, follows) with live badges
- Home feed, Explore, people search, follow suggestions, dark mode

**Stack:** HTML/CSS/JavaScript, Node.js (Express), SQLite (built-in `node:sqlite`, Node 22.5+), Server-Sent Events for real time.

## Run
```
npm install
npm start
```
Open http://localhost:3000. Demo users: maria, arjun, priya, rahul (password `demo123`).
