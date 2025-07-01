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
                this.variables.set('random', randomNum.toString());
                if (message) {
                    await message.reply(`🎲 Nombre aléatoire: ${randomNum}`);
                }
                return randomNum;
            }
            
            // my.random.image - Générer une image aléatoire
            else if (line.startsWith('my.random.image')) {
                const args = this.parseArguments(line);
                const category = args[0] || 'cats';
                const imageUrl = await this.getRandomImage(category);
                this.variables.set('random_image', imageUrl);
                if (message) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🖼️ Image aléatoire: ${category}`)
                        .setImage(imageUrl)
                        .setColor('#ff6b6b');
                    await message.reply({ embeds: [embed] });
                }
                return imageUrl;
            }
            
            // my.random.choice - Choix aléatoire
            else if (line.startsWith('my.random.choice')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    const randomChoice = args[Math.floor(Math.random() * args.length)];
                    this.variables.set('random_choice', randomChoice);
                    if (message) {
                        await message.reply(`🎯 Choix aléatoire: **${randomChoice}**`);
                    }
                    return randomChoice;
                }
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
            
            // my.discord.dm - Envoyer un message privé
            else if (line.startsWith('my.discord.dm') && message) {
                const args = this.parseArguments(line);
                if (args.length >= 2) {
                    await this.sendDM(message, args[0], args[1]);
                }
            }
            
            // my.discord.role - Gérer les rôles
            else if (line.startsWith('my.discord.role') && message) {
                const args = this.parseArguments(line);
                if (args.length >= 3) {
                    await this.manageRole(message, args[0], args[1], args[2]);
                }
            }
            
            // my.discord.channel - Gérer les canaux
            else if (line.startsWith('my.discord.channel') && message) {
                const args = this.parseArguments(line);
                if (args.length >= 2) {
                    await this.manageChannel(message, args[0], args[1], args[2]);
                }
            }
            
            // my.discord.poll - Créer un sondage
            else if (line.startsWith('my.discord.poll') && message) {
                const args = this.parseArguments(line);
                if (args.length >= 3) {
                    await this.createPoll(message, args[0], args.slice(1));
                }
            }
            
            // my.discord.reaction - Ajouter une réaction
            else if (line.startsWith('my.discord.reaction') && message) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    await message.react(args[0]);
                }
            }
            
            // my.math.calculate - Calculatrice
            else if (line.startsWith('my.math.calculate')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    const result = this.calculateMath(args[0]);
                    this.variables.set('math_result', result.toString());
                    if (message) {
                        await message.reply(`🧮 Résultat: ${args[0]} = **${result}**`);
                    }
                    return result;
                }
            }
            
            // my.time.format - Obtenir l'heure formatée
            else if (line.startsWith('my.time.format')) {
                const args = this.parseArguments(line);
                const format = args[0] || 'full';
                const time = this.getFormattedTime(format);
                this.variables.set('current_time', time);
                if (message) {
                    await message.reply(`⏰ Heure actuelle: ${time}`);
                }
                return time;
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
            let value = args[i + 1];
            
            // Remplacer les variables dans les valeurs
            if (value) {
                for (const [varKey, varValue] of this.variables.entries()) {
                    value = value.replace(new RegExp(`{${varKey}}`, 'g'), varValue);
                }
            }
            
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
                case 'author':
                    embed.setAuthor({ name: value });
                    break;
                case 'url':
                    embed.setURL(value);
                    break;
                case 'timestamp':
                    if (value === 'now') {
                        embed.setTimestamp();
                    }
                    break;
                case 'field':
                    // Format: field, "nom", "valeur", inline(true/false)
                    const fieldName = args[i + 1];
                    const fieldValue = args[i + 2];
                    const fieldInline = args[i + 3] === 'true';
                    embed.addFields({ name: fieldName, value: fieldValue, inline: fieldInline });
                    i += 2; // Skip les arguments supplémentaires
                    break;
            }
        }

        await message.reply({ embeds: [embed] });
    }
    
    // Obtenir une image aléatoire depuis une API
    async getRandomImage(category) {
        const apis = {
            'cats': 'https://api.thecatapi.com/v1/images/search',
            'dogs': 'https://api.thedogapi.com/v1/images/search',
            'foxes': 'https://randomfox.ca/floof/',
            'memes': 'https://meme-api.herokuapp.com/gimme',
            'anime': 'https://api.waifu.pics/sfw/neko'
        };
        
        try {
            const fetch = (await import('node-fetch')).default;
            const url = apis[category.toLowerCase()] || apis.cats;
            const response = await fetch(url);
            const data = await response.json();
            
            switch (category.toLowerCase()) {
                case 'cats':
                case 'dogs':
                    return data[0]?.url || 'https://via.placeholder.com/400x300?text=Image+not+found';
                case 'foxes':
                    return data.image || 'https://via.placeholder.com/400x300?text=Image+not+found';
                case 'memes':
                    return data.url || 'https://via.placeholder.com/400x300?text=Image+not+found';
                case 'anime':
                    return data.url || 'https://via.placeholder.com/400x300?text=Image+not+found';
                default:
                    return 'https://via.placeholder.com/400x300?text=Random+Image';
            }
        } catch (error) {
            console.error('Erreur lors de la récupération d\'image:', error);
            return 'https://via.placeholder.com/400x300?text=Error+loading+image';
        }
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

    // Envoyer un message privé
    async sendDM(message, userMention, content) {
        const userId = userMention.replace(/[<@!>]/g, '');
        const user = message.client.users.cache.get(userId);
        
        if (!user) {
            await message.reply('❌ Utilisateur introuvable.');
            return;
        }
        
        try {
            await user.send(content);
            await message.reply(`✅ Message privé envoyé à ${user.tag}`);
        } catch (error) {
            await message.reply('❌ Impossible d\'envoyer le message privé.');
        }
    }
    
    // Gérer les rôles
    async manageRole(message, action, userMention, roleName) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            await message.reply('❌ Vous n\'avez pas les permissions pour gérer les rôles.');
            return;
        }
        
        const userId = userMention.replace(/[<@!>]/g, '');
        const member = message.guild.members.cache.get(userId);
        const role = message.guild.roles.cache.find(r => r.name === roleName);
        
        if (!member || !role) {
            await message.reply('❌ Membre ou rôle introuvable.');
            return;
        }
        
        try {
            if (action === 'add') {
                await member.roles.add(role);
                await message.reply(`✅ Rôle ${roleName} ajouté à ${member.user.tag}`);
            } else if (action === 'remove') {
                await member.roles.remove(role);
                await message.reply(`✅ Rôle ${roleName} retiré de ${member.user.tag}`);
            }
        } catch (error) {
            await message.reply('❌ Erreur lors de la gestion du rôle.');
        }
    }
    
    // Gérer les canaux
    async manageChannel(message, action, channelName, channelType = 'text') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            await message.reply('❌ Vous n\'avez pas les permissions pour gérer les canaux.');
            return;
        }
        
        try {
            if (action === 'create') {
                const channelTypeMap = {
                    'text': ChannelType.GuildText,
                    'voice': ChannelType.GuildVoice,
                    'category': ChannelType.GuildCategory
                };
                
                await message.guild.channels.create({
                    name: channelName,
                    type: channelTypeMap[channelType] || ChannelType.GuildText
                });
                await message.reply(`✅ Canal ${channelName} créé`);
            } else if (action === 'delete') {
                const channel = message.guild.channels.cache.find(c => c.name === channelName);
                if (channel) {
                    await channel.delete();
                    await message.reply(`✅ Canal ${channelName} supprimé`);
                } else {
                    await message.reply('❌ Canal introuvable.');
                }
            }
        } catch (error) {
            await message.reply('❌ Erreur lors de la gestion du canal.');
        }
    }
    
    // Créer un sondage
    async createPoll(message, question, options) {
        const embed = new EmbedBuilder()
            .setTitle('📊 Sondage')
            .setDescription(question)
            .setColor('#3498db')
            .setTimestamp();
        
        let description = question + '\n\n';
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        
        for (let i = 0; i < Math.min(options.length, 10); i++) {
            description += `${emojis[i]} ${options[i]}\n`;
        }
        
        embed.setDescription(description);
        
        const pollMessage = await message.reply({ embeds: [embed] });
        
        for (let i = 0; i < Math.min(options.length, 10); i++) {
            await pollMessage.react(emojis[i]);
        }
    }
    
    // Calculatrice simple
    calculateMath(expression) {
        try {
            // Sécurité basique - seulement les opérations mathématiques de base
            const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
            return Function('"use strict"; return (' + sanitized + ')')();
        } catch (error) {
            return 'Erreur de calcul';
        }
    }
    
    // Obtenir l'heure formatée
    getFormattedTime(format) {
        const now = new Date();
        
        switch (format.toLowerCase()) {
            case 'time':
                return now.toLocaleTimeString('fr-FR');
            case 'date':
                return now.toLocaleDateString('fr-FR');
            case 'full':
                return now.toLocaleString('fr-FR');
            case 'iso':
                return now.toISOString();
            default:
                return now.toLocaleString('fr-FR');
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
