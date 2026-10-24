# VPS Setup Guide - Job Finder Bot (Fully Automated)

Move both the daily job and approval listener to a VPS so your laptop can stay off completely. You'll get packets on your phone at 07:00 and approve/send straight from Telegram.

## Recommended VPS (Free)
- [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/) - Best. VM.Standard.E2.1.Micro is free forever. Ubuntu is fine.
- [Railway](https://railway.app/) - Also good, easy UI
- [Render](https://render.com/) - Background workers work well for the listener

This guide assumes Ubuntu/Debian on Oracle Cloud.

## 1) Create VM & SSH
1. Sign up for Oracle Cloud (Always Free)
2. Create a VM instance (Ubuntu 22.04/24.04)
3. Download/save the SSH key
4. SSH in: `ssh -i your-key.pem ubuntu@YOUR_SERVER_IP`

## 2) Install Node.js, Git, PM2
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2 tsx
node -v && npm -v
```

## 3) Clone repo from GitHub
```bash
cd ~
git clone https://github.com/Sammysystems/job-finder-bot.git
cd job-finder-bot
npm install
```

## 4) Add secrets
Create `.env` in the repo root:
```bash
nano .env
```

Paste:
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

Save and exit (CTRL+X, Y, Enter)

Also copy these files from your laptop if needed:
- `profile/outreach.json`
- `github-repos.json` 
- Any custom data

You can use `scp` from your laptop:
```bash
scp -i your-key.pem profile/outreach.json ubuntu@YOUR_SERVER_IP:/home/ubuntu/job-finder-bot/profile/
scp -i your-key.pem github-repos.json ubuntu@YOUR_SERVER_IP:/home/ubuntu/job-finder-bot/
```

## 5) Start the approval listener (24/7)
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Follow the command pm2 gives you to enable on boot.

Check it's running:
```bash
pm2 list
pm2 logs job-finder-approvals --lines 20
```

## 6) Schedule daily run at 07:00
Edit crontab:
```bash
crontab -e
```

Add this (adjust timezone if needed):
```text
0 7 * * * cd /home/ubuntu/job-finder-bot && /usr/bin/npm run daily >> /home/ubuntu/job-finder-bot/logs/cron-daily.log 2>&1
```

Check timezone:
```bash
timedatectl
```

Change if needed: `sudo timedatectl set-timezone Africa/Lagos` (adjust to your timezone)

## 7) Test
```bash
# Test daily run manually
npm run daily

# Test listener is up - should see it in pm2
pm2 status
```

Once both are running, you can turn your laptop off completely. At 07:00 the cron will run, send packets to Telegram. From your phone you can reply LIST/SEND/EDIT/SKIP and the PM2 listener will process and send emails via Gmail.

## Notes
- Your laptop doesn't need to be on at all after this
- The VPS needs internet (always on)
- Data files like `data/applications.json` live on the VPS now
- If you ever want to update code, just `git pull` and `pm2 restart all`
