// commands.js
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { jidNormalizedUser, toBuffer, downloadContentFromMessage } = require('@whiskeysockets/baileys');

class CommandHandler {
    constructor(bot) {
        this.bot = bot;
        this.commands = new Map();
        this.commandReactions = new Map();
        this.loadCommands();
        this.loadReactions();
    }

    addCommand(name, handler, description = '', usage = '', isOwnerOnly = false) {
        this.commands.set(name, {
            handler,
            description,
            usage,
            isOwnerOnly
        });
    }

    loadCommands() {
        // Basic commands
        this.addCommand('menu', this.showMenu.bind(this), 'Show this menu');
        this.addCommand('help', this.showMenu.bind(this), 'Show this menu');
        this.addCommand('autostatusview', this.toggleStatusView.bind(this), 'Toggle automatic status viewing', 'on/off');
        this.addCommand('info', this.showInfo.bind(this), 'Show bot information');
        this.addCommand('clean', this.cleanAuth.bind(this), 'Clean auth data', '', true);
        this.addCommand('ping', this.pingHandler.bind(this), 'Check if bot is alive');
        this.addCommand('echo', this.echoHandler.bind(this), 'Repeat your message', '<message>');
        this.addCommand('uptime', this.uptimeHandler.bind(this), 'Show bot uptime');
        this.addCommand('mode', this.modeHandler.bind(this), 'Set bot mode', 'public/private', true);
        this.addCommand('vv', this.handleViewOnce.bind(this), 'Forward a view-once message', '', true);
        this.addCommand('vv2', this.handleViewOnce.bind(this), 'Forward a view-once message to the owner', '', true);
        this.addCommand('save', this.handleSave.bind(this), 'Save a replied-to status/message to your DMs', '', true);

        // New commands
        this.addCommand('tagall', this.tagAllHandler.bind(this), 'Tag all group members', '', true);
        this.addCommand('hidetag', this.hideTagHandler.bind(this), 'Send a message to tag all group members secretly', '[message]', true);
    }

    loadReactions() {
        this.commandReactions.set('menu', '📋');
        this.commandReactions.set('help', '❓');
        this.commandReactions.set('autostatusview', '👁️');
        this.commandReactions.set('info', 'ℹ️');
        this.commandReactions.set('clean', '🧹');
        this.commandReactions.set('ping', '🏓');
        this.commandReactions.set('echo', '🔊');
        this.commandReactions.set('uptime', '⏱️');
        this.commandReactions.set('mode', '🔒');
        this.commandReactions.set('vv', '👀');
        this.commandReactions.set('vv2', '👀');
        this.commandReactions.set('save', '💾');
        this.commandReactions.set('tagall', '📣'); 
        this.commandReactions.set('hidetag', '👻'); 
    }

    async handleMessage(msg) {
        try {
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            if (!text.startsWith(this.bot.commandPrefix)) return;

            const args = text.slice(this.bot.commandPrefix.length).trim().split(/ +/);
            const commandName = (args.shift() || '').toLowerCase();

            const cmd = this.commands.get(commandName);
            if (!cmd) return;

            const isGroup = msg.key.remoteJid.endsWith('@g.us');
            
            const rawSenderJid = isGroup ? (msg.key.participant || msg.key.remoteJid) : msg.key.remoteJid;
            if (!rawSenderJid) {
                return;
            }

            // Resolve the JID from a potential LID to a real JID.
            const resolvedSenderJid = this.bot.resolveJid(rawSenderJid);

            // Check if the sender is the owner.
            const isOwner = msg.key.fromMe || this.bot.isOwner(resolvedSenderJid);


            // 1. Check for owner-only commands.
            if (cmd.isOwnerOnly && !isOwner) {
                await this.sendMessage(msg.key.remoteJid, '❌ This command is for the owner only.');
                return;
            }

            // 2. Check for private mode.
            if (this.bot.botMode === 'private' && !isOwner) {
                // Silently ignore the command if the bot is in private mode and sender is not owner
                return; 
            }

            // If all checks pass, react and execute the command.
            await this.reactToCommand(msg, commandName);
            await cmd.handler(msg, args);

        } catch (error) {
            console.error('Command error:', error);
            await this.sendMessage(msg.key.remoteJid, '❌ An error occurred while processing your command');
        }
    }

    async sendMessage(jid, text, options = {}) {
        try {
            await this.bot.sock.sendMessage(jid, { text, ...options });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    async reactToCommand(msg, commandName) {
        const reaction = this.commandReactions.get(commandName);
        if (reaction) {
            try {
                await this.bot.sock.sendMessage(msg.key.remoteJid, {
                    react: {
                        text: reaction,
                        key: msg.key
                    }
                });
            } catch (error) {
                // Fail silently if reaction fails
            }
        }
    }

    async showMenu(msg) {
        const platform = os.platform();
        const arch = os.arch();
        const uptime = this.formatUptime(process.uptime());
        const botUptime = this.formatUptime((new Date() - this.bot.botStartTime) / 1000);
        const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
        const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
        const diskInfo = await this.getDiskUsage();
        const currentDate = new Date().toLocaleString();

        let menuText = `*--[ KAI BOT SYSTEM INTERFACE ]--*\n\n` +
            `*>> SYSTEM STATUS <<*\n` +
            `├── Platform: ${platform} (${arch})\n` +
            `├── Memory: ${freeMem}GB / ${totalMem}GB\n` +
            `├── Storage: ${diskInfo}\n` +
            `├── Process Uptime: ${uptime}\n` +
            `├── Bot Uptime: ${botUptime}\n` +
            `├── Access Mode: *${this.bot.botMode.toUpperCase()}*\n` +
            `└── Command Prefix: *${this.bot.commandPrefix}*\n\n` +
            `*>> CURRENT TIMESTAMP <<*\n` +
            `└── ${currentDate}\n\n` +
            `*>> COMMAND MODULES <<*\n`;

        const categories = {
            '🛠️ Utilities': ['menu', 'help', 'info', 'ping', 'uptime', 'echo', 'vv', 'vv2', 'save', 'tagall', 'hidetag'], 
            '⚙️ Settings': ['autostatusview', 'mode', 'clean']
        };

        for (const [category, commands] of Object.entries(categories)) {
            menuText += `\n*--[ ${category} ]--*\n`;
            commands.forEach(cmdName => {
                const cmd = this.commands.get(cmdName);
                if (cmd) {
                    menuText += `├── *${this.bot.commandPrefix}${cmdName}* - ${cmd.description}\n`;
                    if (cmd.usage) {
                        menuText += `│   └── Usage: ${this.bot.commandPrefix}${cmdName} ${cmd.usage}\n`;
                    }
                }
            });
        }
        
        menuText += `\n*--[ INTERFACE END ]--*\n` +
                    `\n_Developed by Sey at Kairox Tech_` +
                    `\n_🌐 https://heissey.netlify.app_`;

        const menuImagePath = path.join(__dirname, 'assets', 'welcome.jpg');
        
        try {
            if (fs.existsSync(menuImagePath)) {
                await this.bot.sock.sendMessage(msg.key.remoteJid, {
                    image: fs.readFileSync(menuImagePath),
                    caption: menuText,
                    mentions: [msg.key.participant || msg.key.remoteJid]
                });
            } else {
                await this.sendMessage(msg.key.remoteJid, menuText, {
                    mentions: [msg.key.participant || msg.key.remoteJid]
                });
            }
        } catch (error) {
            console.error('Error sending menu:', error);
            await this.sendMessage(msg.key.remoteJid, menuText);
        }
    }

    async getDiskUsage() {
        return new Promise((resolve) => {
            if (os.platform() === 'win32') {
                exec('wmic logicaldisk get size,freespace,caption', (error, stdout) => {
                    if (error) return resolve('N/A (Windows)');
                    const lines = stdout.trim().split('\n').slice(1);
                    const info = lines.map(line => {
                        const [drive, free, total] = line.trim().split(/\s+/);
                        const freeGB = (parseInt(free) / (1024 * 1024 * 1024)).toFixed(2);
                        const totalGB = (parseInt(total) / (1024 * 1024 * 1024)).toFixed(2);
                        return `${drive}: ${freeGB}GB / ${totalGB}GB`;
                    }).join(', ');
                    resolve(info || 'N/A (Windows)');
                });
            } else {
                exec('df -h', (error, stdout) => {
                    if (error) return resolve('N/A');
                    const lines = stdout.trim().split('\n').slice(1);
                    const info = lines.map(line => {
                        const parts = line.trim().split(/\s+/);
                        return `${parts[0]}: ${parts[3]} / ${parts[1]}`;
                    }).join(', ');
                    resolve(info || 'N/A');
                });
            }
        });
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / (3600 * 24));
        seconds %= 3600 * 24;
        const hours = Math.floor(seconds / 3600);
        seconds %= 3600;
        const minutes = Math.floor(seconds / 60);
        seconds = Math.floor(seconds % 60);
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    async toggleStatusView(msg, args) {
        const newStatus = args[0]?.toLowerCase();
        if (newStatus === 'on') {
            this.bot.autoStatusView = true;
            await this.sendMessage(msg.key.remoteJid, '*--[ STATUS UPDATE ]--*\n*>> Auto status viewing: [ENABLED] <<*');
        } else if (newStatus === 'off') {
            this.bot.autoStatusView = false;
            await this.sendMessage(msg.key.remoteJid, '*--[ STATUS UPDATE ]--*\n*>> Auto status viewing: [DISABLED] <<*');
        } else {
            await this.sendMessage(msg.key.remoteJid,
                `*--[ STATUS QUERY ]--*\n*>> Auto status viewing is currently: [${this.bot.autoStatusView ? 'ACTIVE' : 'INACTIVE'}] <<*`);
        }
        await this.bot.saveSettings();
    }

    async showInfo(msg) {
        const infoText = `*--[ KAI BOT INFORMATION ]--*\n\n` +
            `├── *Version*: 1.0.0\n` +
            `├── *Created*: 2025\n` +
            `├── *Developer*: Sey\n` +
            `└── *Company*: Kairox Tech\n\n` +
            `*🌐 Website*: https://heissey.netlify.app\n` +
            `*📱 WhatsApp*: https://wa.me/233508517525\n\n` +
            `Type ${this.bot.commandPrefix}menu for all commands`;

        const infoImagePath = path.join(__dirname, 'assets', 'welcome.jpg');
        
        try {
            if (fs.existsSync(infoImagePath)) {
                await this.bot.sock.sendMessage(msg.key.remoteJid, {
                    image: fs.readFileSync(infoImagePath),
                    caption: infoText,
                    mentions: [msg.key.participant || msg.key.remoteJid]
                });
            } else {
                await this.sendMessage(msg.key.remoteJid, infoText, {
                    mentions: [msg.key.participant || msg.key.remoteJid]
                });
            }
        } catch (error) {
            console.error('Error sending info:', error);
            await this.sendMessage(msg.key.remoteJid, infoText);
        }
    }

    async cleanAuth(msg) {
        await this.bot.cleanAuth();
        await this.sendMessage(msg.key.remoteJid, '*--[ SYSTEM ALERT ]--*\n*>> Authorization data purged successfully. Please restart the bot and re-pair. <<*');
    }

    async pingHandler(msg) {
        const start = Date.now();
        await this.sendMessage(msg.key.remoteJid, '*--[ NETWORK DIAGNOSTIC ]--*\n*>> Pinging remote node... <<*');
        const latency = Date.now() - start;
        await this.sendMessage(msg.key.remoteJid, `*--[ NETWORK RESPONSE ]--*\n*>> Pong! Latency: ${latency}ms <<*`);
    }

    async echoHandler(msg, args) {
        if (!args.length) {
            await this.sendMessage(msg.key.remoteJid, 'Usage: .echo <message>');
            return;
        }

        await this.sendMessage(msg.key.remoteJid, `*--[ ECHO PROTOCOL ]--*\n*>> ${args.join(' ')} <<*`, {
            mentions: [msg.key.participant || msg.key.remoteJid]
        });
    }

    async uptimeHandler(msg) {
        const botUptime = this.formatUptime((new Date() - this.bot.botStartTime) / 1000);
        const processUptime = this.formatUptime(process.uptime());
        await this.sendMessage(msg.key.remoteJid, 
            `*--[ SYSTEM UPTIME ]--*\n` +
            `├── Bot Uptime: ${botUptime}\n` +
            `└── Process Uptime: ${processUptime}`,
            { mentions: [msg.key.participant || msg.key.remoteJid] }
        );
    }

    async modeHandler(msg, args) {
        let senderJid;
        const isGroup = msg.key.remoteJid.endsWith('@g.us');

        if (msg.key.fromMe) {
            senderJid = jidNormalizedUser(this.bot.ownerJid);
        } else if (isGroup) {
            senderJid = jidNormalizedUser(msg.key.participant);
        } else {
            senderJid = jidNormalizedUser(msg.key.remoteJid);
        }
        
        if (!senderJid) {
            console.warn('Could not determine sender for mode command:', msg.key);
            await this.sendMessage(msg.key.remoteJid, '❌ An error occurred determining sender identity.');
            return; 
        }

        if (!this.bot.isOwner(senderJid)) {
            await this.sendMessage(msg.key.remoteJid, '❌ Only owner can change bot mode.');
            return;
        }

        if (!args.length) {
            const modeInfo = `*--[ CURRENT MODE ]--*\n*>> ${this.bot.botMode.toUpperCase()} <<*\n` +
                `In private mode, only you can use commands.\n` +
                `Usage: .mode public/private`;
            await this.sendMessage(msg.key.remoteJid, modeInfo);
            return;
        }

        const newMode = args[0].toLowerCase();
        if (['public', 'private'].includes(newMode)) {
            this.bot.botMode = newMode;
            await this.bot.saveSettings();
            await this.sendMessage(msg.key.remoteJid, `*--[ MODE UPDATE ]--*\n*>> Bot mode set to: [${newMode.toUpperCase()}] <<*`);
        } else {
            await this.sendMessage(msg.key.remoteJid, 'Invalid mode. Usage: .mode public/private');
        }
    }

    async handleViewOnce(msg, args) {
        try {
            const command = msg.message?.conversation?.split(' ')[0] || msg.message?.extendedTextMessage?.text?.split(' ')[0];
            const quotedInfo = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = quotedInfo?.quotedMessage;

            if (!quoted || (!quoted.viewOnceMessage && !quoted.viewOnceMessageV2)) {
                await this.sendMessage(msg.key.remoteJid, '❌ Please reply to a view-once message to use this command.');
                return;
            }

            const viewOnceMsg = quoted.viewOnceMessage || quoted.viewOnceMessageV2;
            const innerMessage = viewOnceMsg.message;
            const type = Object.keys(innerMessage)[0];
            
            const targetJid = command === '.vv2' ? this.bot.ownerJid : msg.key.remoteJid;

            if (!targetJid) {
                await this.sendMessage(msg.key.remoteJid, '❌ Could not determine where to send the message.');
                return;
            }

            let messageContent;

            if (type === 'imageMessage' || type === 'videoMessage' || type === 'audioMessage') {
                const mediaType = type.replace('Message', '');
                const stream = await downloadContentFromMessage(innerMessage[type], mediaType);
                const media = await toBuffer(stream);
                const caption = innerMessage[type].caption || '';

                if (type === 'imageMessage') {
                    messageContent = { image: media, caption: `*--[ DECRYPTED IMAGE ]--*\n${caption}` };
                } else if (type === 'videoMessage') {
                    messageContent = { video: media, mimetype: innerMessage[type].mimetype, caption: `*--[ DECRYPTED VIDEO ]--*\n${caption}`, gifPlayback: innerMessage[type].gifPlayback || false };
                } else if (type === 'audioMessage') {
                    messageContent = { audio: media, mimetype: innerMessage[type].mimetype, ptt: innerMessage[type].ptt };
                }
            } else {
                messageContent = innerMessage;
                if (messageContent.conversation) messageContent.conversation = `*--[ DECRYPTED MESSAGE ]--*\n${messageContent.conversation}`;
                if (messageContent.extendedTextMessage?.text) messageContent.extendedTextMessage.text = `*--[ DECRYPTED TEXT ]--*\n${messageContent.extendedTextMessage.text}`;
            }
            
            if (messageContent) {
                await this.bot.sock.sendMessage(targetJid, messageContent);
                await this.sendMessage(msg.key.remoteJid, '✅ View-once message forwarded.');
            } else {
                throw new Error(`Unsupported view-once message type: ${type}`);
            }

        } catch (error) {
            console.error('Failed to forward view-once message:', error);
            await this.sendMessage(msg.key.remoteJid, '❌ Failed to process the view-once message. It might be expired, invalid, or an unsupported type.');
        }
    }

    async handleSave(msg, args) {
        try {
            const quotedInfo = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = quotedInfo?.quotedMessage;

            if (!quoted) {
                await this.sendMessage(msg.key.remoteJid, '❌ Please reply to a status or message to save it.');
                return;
            }

            const ownerJid = this.bot.ownerJid;
            if (!ownerJid) {
                await this.sendMessage(msg.key.remoteJid, '❌ Owner JID not configured. Cannot save message.');
                return;
            }

            const originalSenderJid = quotedInfo.participant;
            const senderName = originalSenderJid ? (await this.bot.getUserName(originalSenderJid) || originalSenderJid.split('@')[0]) : 'Unknown';
            const forwardHeader = `*--[ ARCHIVED DATA ]--*\n*Source: ${senderName}*`;

            const type = Object.keys(quoted)[0];
            let messageContent;

            if (type === 'conversation' || type === 'extendedTextMessage') {
                const text = quoted.conversation || quoted.extendedTextMessage.text;
                messageContent = { text: `${forwardHeader}\n\n${text}` };
            } else if (type === 'imageMessage' || type === 'videoMessage' || type === 'audioMessage') {
                const mediaType = type.replace('Message', '');
                const stream = await downloadContentFromMessage(quoted[type], mediaType);
                const media = await toBuffer(stream);
                const caption = quoted[type].caption || '';

                messageContent = {
                    caption: `${forwardHeader}\n\n${caption}`.trim(),
                };

                if (type === 'imageMessage') {
                    messageContent.image = media;
                } else if (type === 'videoMessage') {
                    messageContent.video = media;
                    messageContent.mimetype = quoted[type].mimetype;
                } else if (type === 'audioMessage') {
                    messageContent.audio = media;
                    messageContent.mimetype = quoted[type].mimetype;
                    messageContent.ptt = quoted[type].ptt;
                }
            } else if (type === 'stickerMessage') {
                const stream = await downloadContentFromMessage(quoted[type], 'sticker');
                const media = await toBuffer(stream);
                await this.bot.sock.sendMessage(ownerJid, { sticker: media });
                await this.sendMessage(ownerJid, forwardHeader);
                await this.sendMessage(msg.key.remoteJid, '✅ Saved to your DMs!');
                return;
            } else {
                await this.sendMessage(msg.key.remoteJid, `❌ Saving this type of message (${type}) is not yet supported.`);
                return;
            }

            if (messageContent) {
                await this.bot.sock.sendMessage(ownerJid, messageContent);
                await this.sendMessage(msg.key.remoteJid, '✅ Saved to your DMs!');
            }

        } catch (error) {
            console.error('Failed to save message:', error);
            await this.sendMessage(msg.key.remoteJid, '❌ Failed to save the message. An error occurred.');
        }
    }

    async tagAllHandler(msg, args) {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await this.sendMessage(msg.key.remoteJid, '❌ This command can only be used in a group.');
            return;
        }

        try {
            const groupMetadata = await this.bot.sock.groupMetadata(msg.key.remoteJid);
            const participants = groupMetadata.participants.map(p => p.id);
            
            let message = args.join(' ') || 'Attention everyone!';
            let mentions = [];
            let taggedText = '';

            for (let i = 0; i < participants.length; i++) {
                const participant = participants[i];
                const resolvedJid = this.bot.resolveJid(participant);
                mentions.push(resolvedJid);
                taggedText += `@${resolvedJid.split('@')[0]}${i === participants.length - 1 ? '' : ' '}`;
            }

            const fullMessage = `*--[ BROADCAST ALERT ]--*\n*Message: ${message}*\n\n${taggedText}`;

            await this.bot.sock.sendMessage(msg.key.remoteJid, {
                text: fullMessage,
                mentions: mentions
            });
        } catch (error) {
            console.error('Error during tagall:', error);
            await this.sendMessage(msg.key.remoteJid, '❌ Failed to tag all members. Make sure the bot is an admin.');
        }
    }

    async hideTagHandler(msg, args) {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await this.sendMessage(msg.key.remoteJid, '❌ This command can only be used in a group.');
            return;
        }

        try {
            const groupMetadata = await this.bot.sock.groupMetadata(msg.key.remoteJid);
            const participants = groupMetadata.participants.map(p => p.id);
            
            let message = args.join(' ') || '🤫 Secret message for the group!';
            
            let mentions = [];
            for (const participant of participants) {
                const resolvedJid = this.bot.resolveJid(participant);
                mentions.push(resolvedJid);
            }

            const imagePath = path.join(__dirname, 'assets', 'hidetag.jpg'); 
            
            if (fs.existsSync(imagePath)) {
                await this.bot.sock.sendMessage(msg.key.remoteJid, {
                    image: fs.readFileSync(imagePath),
                    caption: `*--[ STEALTH BROADCAST ]--*\n*Message: ${message}*`, 
                    mentions: mentions
                });
            } else {
                await this.bot.sock.sendMessage(msg.key.remoteJid, {
                    text: `*--[ STEALTH BROADCAST ]--*\n*Message: ${message}*`,
                    mentions: mentions
                });
            }
            await this.sendMessage(msg.key.remoteJid, '✅ Hidden tag message sent.');
            
        } catch (error) {
            console.error('Error during hidetag:', error);
            await this.sendMessage(msg.key.remoteJid, '❌ Failed to send hidden tag message. Make sure the bot is an admin.');
        }
    }
}

module.exports = CommandHandler;