// index.js
const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const qrcode = require('qrcode-terminal');
const CommandHandler = require('./commands');
const os = require('os');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.authDir = './auth_info';
        this.viewedStatuses = new Set();
        this.isPaired = false;
        this.pairingMethod = null;
        this.qrGenerated = false;
        this.autoStatusView = true;
        this.commandHandler = new CommandHandler(this);
        this.botStartTime = new Date();
        this.botMode = 'public';
        this.commandPrefix = '.';
        this.ownerJid = null;
        this.ownerNumber = null;
        this.lidJidMap = new Map(); // Stores mapping from LID to real JID

        this.loadSettings();
    }

    loadSettings() {
        try {
            const settingsPath = path.join(__dirname, 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                if (settings.mode) {
                    this.botMode = settings.mode;
                }
                if (typeof settings.autoViewStatus === 'boolean') {
                    this.autoStatusView = settings.autoViewStatus;
                }
                // Settings loaded successfully.
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        try {
            const settingsPath = path.join(__dirname, 'settings.json');
            const settings = {
                mode: this.botMode,
                autoViewStatus: this.autoStatusView
            };
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            // Settings saved successfully.
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    isOwner(jid) {
        if (!jid || !this.ownerNumber) {
            return false;
        }
        
        try {
            const normalized = jidNormalizedUser(jid);
            const numberPart = normalized.split('@')[0];
            return numberPart === this.ownerNumber;
        } catch (e) {
            console.error('Error in isOwner:', e);
            return false;
        }
    }

    async getUserName(jid) {
        try {
            if (!this.sock) return '';
            
            const contact = await this.sock.contact.get(jid);
            if (contact?.name || contact?.pushName) {
                return contact.name || contact.pushName;
            }
            
            try {
                const [user] = await this.sock.fetchStatus(jid);
                if (user?.status) {
                    return user.status;
                }
            } catch (statusError) {
                // console.log('Could not fetch status:', statusError.message);
            }
            
            return '';
        } catch (error) {
            console.error('Error getting user name:', error);
            return '';
        }
    }

    async sendWelcomeMessage(ownerJid) {
        try {
            const userName = await this.getUserName(ownerJid);
            const mentionName = userName ? `@${userName}` : 'there';
            
            const welcomeText = `Hey ${mentionName},\n\n` +
                `✅ > 𝙺𝚊𝚒 𝚒𝚜 𝚗𝚘𝚠 𝚌𝚘𝚗𝚗𝚎𝚌𝚝𝚎𝚍 𝚊𝚗𝚍 𝚛𝚎𝚊𝚍𝚢 𝚝𝚘 go! \n\n` +
                `🤖 Developed by *Sey* at *Kairox Tech*\n` +
                `🌐 Website: https://heissey.netlify.app\n` +
                `🐙 GitHub: https://github.com/kairox-sey\n` +
                `📱 WhatsApp: https://wa.me/233508517525\n` +
                `👥 Join our community: https://chat.whatsapp.com/LFF35nOZZwi1nLFey31tEu\n\n` +
                `Type ${this.commandPrefix}menu to see all commands\n` +
                `🔒 Current mode: ${this.botMode.toUpperCase()}`;

            const messageOptions = {
                mentions: userName ? [ownerJid] : undefined
            };

            const imagePath = path.join(__dirname, 'assets', 'welcome.jpg');
            if (fs.existsSync(imagePath)) {
                await this.sock.sendMessage(ownerJid, {
                    image: fs.readFileSync(imagePath),
                    caption: welcomeText,
                    ...messageOptions,
                    mimetype: 'image/jpeg'
                });
                // Sent welcome message with image
            } else {
                await this.sock.sendMessage(ownerJid, {
                    text: welcomeText,
                    ...messageOptions
                });
                // Sent welcome message (text only)
            }
        } catch (error) {
            console.error('Failed to send welcome:', error);
            await this.sock.sendMessage(ownerJid, { 
                text: `Hey there,\n\n✅ *ꓚ⌊⌋ 𝙺𝚊𝚒 𝚒𝙽𝚘𝚠 𝚌𝙾𝚗𝚗𝚎𝚌𝚝𝚎𝚍!*\n👥 Join our community: https://chat.whatsapp.com/LFF35nOZZwi1nLFey31tEu\n\nType ${this.commandPrefix}menu for commands\n🔒 Current mode: ${this.botMode.toUpperCase()}`
            });
        }
    }

    async startBot() {
        try {
            if (!fs.existsSync(this.authDir)) {
                fs.mkdirSync(this.authDir, { recursive: true });
            }

            const { version } = await fetchLatestBaileysVersion();
            // Using Baileys version...

            const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

            if (state.creds.registered) {
                // Found existing session, connecting...
                this.isPaired = true;
            } else {
                // No existing session found, need to pair device
            }

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: true,
                auth: state,
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                markOnlineOnConnect: true,
                getMessage: async () => ({ conversation: "Status Bot" }),
                shouldIgnoreJid: () => false,
                connectTimeoutMs: 30_000,
                keepAliveIntervalMs: 15_000
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !this.qrGenerated && !this.isPaired) {
                    this.qrGenerated = true;
                    qrcode.generate(qr, { small: true });
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    // Connection closed
                    
                    if (shouldReconnect) {
                        // Reconnecting...
                        setTimeout(() => this.startBot(), 5000);
                    }
                } else if (connection === 'open') {
                    // Connected successfully!
                    this.isPaired = true;
                    
                    if (this.sock.user?.id) {
                        this.ownerJid = jidNormalizedUser(this.sock.user.id);
                        this.ownerNumber = this.ownerJid.split('@')[0];
                        // Owner identified as the bot's own number
                        
                        try {
                            await this.sendWelcomeMessage(this.ownerJid);
                        } catch (error) {
                            console.error('Failed to send welcome:', error);
                        }
                    }
                    
                    this.startStatusViewing();
                    this.fetchAllGroupMetadata(); // Fetch metadata on connect
                }
            });

            this.sock.ev.on('groups.update', async (updates) => {
                for (const update of updates) {
                    if (update.id) { // On any group update, refetch the interactive metadata
                        // Detected group update, refetching...
                        try {
                            const result = await this.sock.query({
                                tag: 'iq',
                                attrs: { to: update.id, type: 'get', xmlns: 'w:g2' },
                                content: [{ tag: 'query', attrs: { request: 'interactive' } }]
                            });
                            const groupNode = result.content.find(c => c.tag === 'group');
                            if (groupNode) {
                                this.updateJidMap(groupNode, update.id);
                            }
                        } catch (error) {
                            console.error(`[ERROR] Failed to fetch interactive metadata for group ${update.id}`, error);
                        }
                    }
                }
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                const { messages } = m;
                for (const msg of messages) {
                    // Pass all messages to the command handler
                    await this.commandHandler.handleMessage(msg);
                    
                    if (msg.key.remoteJid?.endsWith('@broadcast') && this.autoStatusView) {
                        await this.viewStatus(msg.key);
                    }
                }
            });

            if (!this.isPaired) {
                setTimeout(async () => {
                    try {
                        await this.selectPairingMethod();
                    } catch (error) {
                        console.error('Pairing failed:', error);
                    }
                }, 3000);
            }

        } catch (error) {
            console.error('Bot error:', error);
            setTimeout(() => this.startBot(), 5000);
        }
    }

    async cleanAuth() {
        try {
            if (fs.existsSync(this.authDir)) {
                fs.rmSync(this.authDir, { recursive: true });
                // Cleaned auth directory
            }
        } catch (error) {
            console.error('Clean error:', error);
        }
    }

    async selectPairingMethod() {
        console.log('\n🔗 Choose pairing method:');
        console.log('1. QR Code (Recommended)');
        console.log('2. Phone Number Pairing Code');
        
        const choice = await question('Enter choice (1/2): ');
        
        if (choice === '2') {
            this.pairingMethod = 'phone';
            await this.requestPairingCode();
        } else {
            this.pairingMethod = 'qr';
            // Waiting for QR code...
        }
    }

    async requestPairingCode() {
        try {
            const phoneNumber = await question('📱 Enter phone number with country code: ');
            const cleanNumber = phoneNumber.replace(/\D/g, '');
            
            if (!cleanNumber || cleanNumber.length < 10) {
                throw new Error('Invalid number');
            }

            const code = await this.sock.requestPairingCode(cleanNumber);
            
            // YOUR PAIRING CODE:
            console.log('\n📝 Open WhatsApp > Settings > Linked Devices > Link a Device');
            console.log('📝 Choose "Link with phone number" and enter the code');
            console.log(`\n🔑 Your Pairing Code: *${code}*`); // Added this line
            console.log('\n⏰ Code expires in 2 minutes');

        } catch (error) {
            console.error('Code error:', error);
            throw error;
        }
    }

    async viewStatus(messageKey) {
        try {
            if (!this.sock) return;

            const statusId = `${messageKey.remoteJid}_${messageKey.id}`;
            
            if (!this.viewedStatuses.has(statusId)) {
                await this.sock.readMessages([messageKey]);
                this.viewedStatuses.add(statusId);
                // Viewed status from...
            }
        } catch (error) {
            console.error('View error:', error);
        }
    }
    
        updateJidMap(groupNode, groupId) {
            // This function now parses the result of the low-level 'interactive' query
            if (!Array.isArray(groupNode.content)) return;
    
            const participantNodes = groupNode.content.filter(c => c.tag === 'participant');
            if (!participantNodes.length) {
                return;
            }
    
            for (const pNode of participantNodes) {
                const lid = pNode.attrs.jid;
                const realJid = pNode.attrs.phone_number;
    
                // We are looking for the structure: <participant jid="<LID>" phone_number="<REAL_JID>">
                if (lid && realJid && lid.endsWith('@lid')) {
                    if (!this.lidJidMap.has(lid) || this.lidJidMap.get(lid) !== realJid) {
                        this.lidJidMap.set(lid, realJid);
                    }
                }
            }
        }
    
        async fetchAllGroupMetadata() {
            // Fetching interactive metadata for all groups...
            try {
                const groups = await this.sock.groupFetchAllParticipating();
                // Found groups...
                for (const id in groups) {
                    try {
                        const result = await this.sock.query({
                            tag: 'iq',
                            attrs: { to: id, type: 'get', xmlns: 'w:g2' },
                            content: [{ tag: 'query', attrs: { request: 'interactive' } }]
                        });
                        
                        const groupNode = result.content.find(c => c.tag === 'group');
                        if (groupNode) {
                            this.updateJidMap(groupNode, id);
                        }
                    } catch (error) {
                        console.error(`Failed to fetch interactive metadata for group ${id}`, error);
                    }
                }
                // Finished fetching all group metadata.
            } catch (error) {
                console.error('Could not fetch participating groups.', error);
            }
        }
    
        resolveJid(jid) {
            if (jid?.endsWith('@lid')) {
                const resolved = this.lidJidMap.get(jid);
                if (resolved) {
                    return resolved;
                }
            }
            return jid;
        }

    async startStatusViewing() {
        // Starting status viewer...
        setInterval(async () => {
            try {
                if (this.sock && this.isPaired) {
                    await this.sock.sendPresenceUpdate('available');
                }
            } catch (error) {
                console.error('Presence error:', error);
            }
        }, 30000);
    }

    async stop() {
        try {
            if (this.sock) {
                await this.sock.end(undefined);
            }
            rl.close();
        } catch (error) {
            console.error('Stop error:', error);
        }
    }
}

async function main() {
    console.log('===============================');
    console.log('🤖 Kai is Starting...');
    console.log('===============================');
    console.log('Created with love by 𝕊𝔼𝕐');
    console.log('===============================');
    
    const bot = new WhatsAppBot();
    
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down...');
        await bot.stop();
        process.exit(0);
    });
    
    await bot.startBot();
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = WhatsAppBot;