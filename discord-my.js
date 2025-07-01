const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

class DiscordMyBot {
    constructor() {
        this.client = null;
        this.prefix = '!';
        this.commands = new Map();
        this.variables = new Map();
        this.errorMessages = new Map();
        this.token = null;
        this.isConnected = false;
    }

    // Fonction pour gérer les erreurs personnalisées
    handleError(errorType, customMessage = null) {
        const defaultMessage = this.errorMessages.get(errorType) || 'Une erreur est survenue.';
        console.error(`❌ ${customMessage || defaultMessage}`);
    }

    // Parser pour extraire les arguments d'une fonction Maya
    parseArguments(line) {
        const start = line.indexOf('(');
        const end = line.lastIndexOf(')');
        if (start === -1 || end === -1) return [];
        
        const argsStr = line.substring(start + 1, end).trim();
        if (!argsStr) return [];
        
        // Parser simple pour les arguments séparés par des virgules
        const args = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];
            
            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = '';
            } else if (char === ',' && !inQuotes) {
                args.push(current.trim().replace(/^['"]|['"]$/g, ''));
                current = '';
                continue;
            }
            
            current += char;
        }
        
        if (current.trim()) {
            args.push(current.trim().replace(/^['"]|['"]$/g, ''));
        }
        
        return args;
    }

    // Interpréter une ligne de code Discord.my
    async interpretLine(line, message = null) {
        line = line.trim();
        if (!line || line.startsWith('//')) return;

        try {
            // my.discord.connect - Connexion du bot
            if (line.startsWith('my.discord.connect')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    this.token = args[0];
                    await this.connectBot();
                }
            }
            
            // my.discord.prefix - Définir le préfixe
            else if (line.startsWith('my.discord.prefix')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    this.prefix = args[0];
                    console.log(`🔧 Préfixe défini: ${this.prefix}`);
                }
            }
            
            // my.discord.status - Définir le statut
            else if (line.startsWith('my.discord.status')) {
                const args = this.parseArguments(line);
                if (args.length >= 2) {
                    await this.setStatus(args[0], args[1], args[2] || null);
                }
            }
            
            // my.discord.command - Créer une commande
            else if (line.startsWith('my.discord.command')) {
                const args = this.parseArguments(line);
                if (args.length >= 2) {
                    this.createCommand(args[0], args[1], args.slice(2));
                }
            }
            
            // my.discord.embed - Créer un embed
            else if (line.startsWith('my.discord.embed') && message) {
                const args = this.parseArguments(line);
                await this.sendEmbed(message, args);
            }
            
            // my.discord.send - Envoyer un message
            else if (line.startsWith('my.discord.send') && message) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    await message.reply(args[0]);
                }
            }
            
            // my.discord.error - Définir un message d'erreur personnalisé
            else if (line.startsWith('my.discord.error')) {
                const args = this.parseArguments(line);
                if (args.length >= 2) {
                    this.errorMessages.set(args[0], args[1]);
                }
            }
            
            // my.variable - Créer une variable
            else if (line.startsWith('my.variable')) {
                const parts = line.split('=');
                if (parts.length === 2) {
                    const varName = parts[0].replace('my.variable', '').trim();
                    const varValue = parts[1].trim().replace(/^['"]|['"]$/g, '');
                    this.variables.set(varName, varValue);
                }
            }
            
            // my.random.number - Générer un nombre aléatoire
            else if (line.startsWith('my.random.number')) {
                const args = this.parseArguments(line);
                const min = parseInt(args[0]) || 1;
                const max = parseInt(args[1]) || 100;
                const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
                if (message) {
                    await message.reply(`🎲 Nombre aléatoire: ${randomNum}`);
                }
                return randomNum;
            }
            
            // my.discord.kick - Kick un membre
            else if (line.startsWith('my.discord.kick') && message) {
                const args = this.parseArguments(line);
                await this.kickMember(message, args[0], args[1]);
            }
            
            // my.discord.ban - Ban un membre
            else if (line.startsWith('my.discord.ban') && message) {
                const args = this.parseArguments(line);
                await this.banMember(message, args[0], args[1]);
            }
            
            // my.console - Afficher dans la console
            else if (line.startsWith('my.console')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    console.log(`💬 ${args[0]}`);
                }
            }

        } catch (error) {
            console.error(`❌ Erreur lors de l'interprétation: ${error.message}`);
        }
    }

    // Connexion du bot Discord
    async connectBot() {
        if (!this.token) {
            this.handleError('connection', 'Token manquant pour la connexion');
            return;
        }

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildModeration
            ]
        });

        this.client.once('ready', () => {
            console.log(`🤖 Bot connecté en tant que ${this.client.user.tag}!`);
            this.isConnected = true;
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.content.startsWith(this.prefix)) return;

            const args = message.content.slice(this.prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            if (this.commands.has(commandName)) {
                const command = this.commands.get(commandName);
                try {
                    await this.executeCommand(command, message, args);
                } catch (error) {
                    console.error(`❌ Erreur lors de l'exécution de la commande ${commandName}:`, error);
                }
            }
        });

        try {
            await this.client.login(this.token);
        } catch (error) {
            this.handleError('connection', `Échec de la connexion: ${error.message}`);
        }
    }

    // Définir le statut du bot
    async setStatus(type, activity, status = 'online') {
        if (!this.client || !this.isConnected) return;

        const activityTypes = {
            'playing': ActivityType.Playing,
            'listening': ActivityType.Listening,
            'watching': ActivityType.Watching,
            'streaming': ActivityType.Streaming
        };

        const statusTypes = {
            'online': 'online',
            'idle': 'idle',
            'dnd': 'dnd',
            'invisible': 'invisible'
        };

        try {
            await this.client.user.setPresence({
                activities: [{
                    name: activity,
                    type: activityTypes[type.toLowerCase()] || ActivityType.Playing
                }],
                status: statusTypes[status.toLowerCase()] || 'online'
            });
            console.log(`✅ Statut défini: ${type} ${activity} (${status})`);
        } catch (error) {
            this.handleError('status', `Erreur lors de la définition du statut: ${error.message}`);
        }
    }

    // Créer une commande
    createCommand(name, response, options = []) {
        this.commands.set(name, {
            response: response,
            options: options
        });
        console.log(`📝 Commande créée: ${this.prefix}${name}`);
    }

    // Exécuter une commande
    async executeCommand(command, message, args) {
        // Remplacer les variables dans la réponse
        let response = command.response;
        for (const [key, value] of this.variables.entries()) {
            response = response.replace(new RegExp(`{${key}}`, 'g'), value);
        }

        await message.reply(response);
    }

    // Envoyer un embed
    async sendEmbed(message, args) {
        const embed = new EmbedBuilder();
        
        // Parser les arguments de l'embed
        for (let i = 0; i < args.length; i += 2) {
            const key = args[i]?.toLowerCase();
            const value = args[i + 1];
            
            switch (key) {
                case 'title':
                    embed.setTitle(value);
                    break;
                case 'description':
                    embed.setDescription(value);
                    break;
                case 'color':
                    embed.setColor(value);
                    break;
                case 'footer':
                    embed.setFooter({ text: value });
                    break;
                case 'image':
                    embed.setImage(value);
                    break;
                case 'thumbnail':
                    embed.setThumbnail(value);
                    break;
            }
        }

        await message.reply({ embeds: [embed] });
    }

    // Kick un membre
    async kickMember(message, userMention, reason = 'Aucune raison spécifiée') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            await message.reply('❌ Vous n\'avez pas les permissions pour kick des membres.');
            return;
        }

        const userId = userMention.replace(/[<@!>]/g, '');
        const member = message.guild.members.cache.get(userId);

        if (!member) {
            await message.reply('❌ Membre introuvable.');
            return;
        }

        try {
            await member.kick(reason);
            await message.reply(`✅ ${member.user.tag} a été kické. Raison: ${reason}`);
        } catch (error) {
            await message.reply('❌ Impossible de kick ce membre.');
        }
    }

    // Ban un membre
    async banMember(message, userMention, reason = 'Aucune raison spécifiée') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            await message.reply('❌ Vous n\'avez pas les permissions pour ban des membres.');
            return;
        }

        const userId = userMention.replace(/[<@!>]/g, '');
        const member = message.guild.members.cache.get(userId);

        if (!member) {
            await message.reply('❌ Membre introuvable.');
            return;
        }

        try {
            await member.ban({ reason: reason });
            await message.reply(`✅ ${member.user.tag} a été banni. Raison: ${reason}`);
        } catch (error) {
            await message.reply('❌ Impossible de ban ce membre.');
        }
    }

    // Interpréter un fichier .my
    async interpretFile(filename) {
        try {
            const content = fs.readFileSync(filename, 'utf8');
            const lines = content.split('\n');
            
            console.log(`🚀 Démarrage du bot Discord.my depuis ${filename}`);
            
            for (const line of lines) {
                await this.interpretLine(line.trim());
            }
            
            // Garder le processus en vie
            if (this.isConnected) {
                console.log(`✅ Bot ${filename} démarré avec succès! Appuyez sur Ctrl+C pour arrêter.`);
                process.on('SIGINT', () => {
                    console.log('\n🔴 Arrêt du bot...');
                    if (this.client) {
                        this.client.destroy();
                    }
                    process.exit(0);
                });
            }
        } catch (error) {
            console.error(`❌ Erreur lors de la lecture du fichier ${filename}: ${error.message}`);
        }
    }
}

// CLI pour Discord.my
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
🤖 Discord.my - Créateur de bots Discord avec la syntaxe Maya

Usage:
  maya Discord.my-allume <fichier.my>

Exemple:
  maya Discord.my-allume mon_bot.my
        `);
        process.exit(1);
    }

    const filename = args[0];
    if (!fs.existsSync(filename)) {
        console.error(`❌ Fichier ${filename} introuvable.`);
        process.exit(1);
    }

    const bot = new DiscordMyBot();
    bot.interpretFile(filename);
}

module.exports = DiscordMyBot;
