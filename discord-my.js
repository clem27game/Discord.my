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
        this.currentCommand = null;
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
    async interpretLine(line, message = null, commandContext = null) {
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
                    this.currentCommand = args[0]; // Stocker la commande actuelle
                }
            }

            // my.discord.embed - Créer un embed (associé à la dernière commande créée)
            else if (line.startsWith('my.discord.embed')) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker l'embed dans la commande
                    this.commands.get(this.currentCommand).embed = args;
                } else if (message) {
                    // Exécution directe si on a un message
                    await this.sendEmbed(message, args);
                }
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

                // Si on est dans le contexte d'une commande, stocker l'action
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
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

                // Si on est dans le contexte d'une commande, stocker l'action
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
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

                    // Si on est dans le contexte d'une commande, stocker l'action
                    if (this.currentCommand && this.commands.has(this.currentCommand)) {
                        this.commands.get(this.currentCommand).actions.push(line);
                    } else if (message) {
                        await message.reply(`🎯 Choix aléatoire: **${randomChoice}**`);
                    }
                    return randomChoice;
                }
            }

            // my.discord.kick - Kick un membre
            else if (line.startsWith('my.discord.kick') && message) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de kick dans la commande
                    this.commands.get(this.currentCommand).kickParams = {
                        target: args[0],
                        reason: args[1] || 'Aucune raison spécifiée'
                    };
                } else {
                    await this.kickMember(message, args[0], args[1]);
                }
            }

            // my.discord.ban - Ban un membre
            else if (line.startsWith('my.discord.ban') && message) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de ban dans la commande
                    this.commands.get(this.currentCommand).banParams = {
                        target: args[0],
                        reason: args[1] || 'Aucune raison spécifiée'
                    };
                } else {
                    await this.banMember(message, args[0], args[1]);
                }
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
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de DM dans la commande
                    this.commands.get(this.currentCommand).dmParams = {
                        target: args[0],
                        message: args[1] || 'Message par défaut'
                    };
                } else if (args.length >= 2) {
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
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de sondage dans la commande
                    this.commands.get(this.currentCommand).pollParams = {
                        question: args[0],
                        options: args.slice(1)
                    };
                } else if (args.length >= 2) {
                    await this.createPoll(message, args[0], args.slice(1));
                }
            }

            // my.discord.reaction - Ajouter une réaction
            else if (line.startsWith('my.discord.reaction') && message) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de réaction dans la commande
                    this.commands.get(this.currentCommand).reactionParams = {
                        emoji: args[0] || '👍'
                    };
                } else if (args.length > 0) {
                    await message.react(args[0]);
                }
            }

            // my.discord.server.info - Informations du serveur
            else if (line.startsWith('my.discord.server.info') && message) {
                await this.getServerInfo(message);
            }

            // my.discord.user.info - Informations de l'utilisateur
            else if (line.startsWith('my.discord.user.info') && message) {
                const args = this.parseArguments(line);
                await this.getUserInfo(message, args[0]);
            }

            // my.discord.mute - Mute un membre
            else if (line.startsWith('my.discord.mute') && message) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).muteParams = {
                        target: args[0],
                        duration: args[1] || '10m',
                        reason: args[2] || 'Aucune raison spécifiée'
                    };
                } else {
                    await this.muteMember(message, args[0], args[1], args[2]);
                }
            }

            // my.discord.purge - Supprimer des messages
            else if (line.startsWith('my.discord.purge') && message) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).purgeParams = {
                        amount: args[0] || '10'
                    };
                } else {
                    await this.purgeMessages(message, args[0]);
                }
            }

            // my.discord.avatar - Obtenir l'avatar d'un utilisateur
            else if (line.startsWith('my.discord.avatar') && message) {
                const args = this.parseArguments(line);
                await this.getUserAvatar(message, args[0]);
            }

            // my.math.calculate - Calculatrice
            else if (line.startsWith('my.math.calculate')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    const result = this.calculateMath(args[0]);
                    this.variables.set('math_result', result.toString());

                    // Si on est dans le contexte d'une commande, stocker l'action
                    if (this.currentCommand && this.commands.has(this.currentCommand)) {
                        this.commands.get(this.currentCommand).actions.push(line);
                    } else if (message) {
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

                // Si on est dans le contexte d'une commande, stocker l'action
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(`⏰ Heure actuelle: ${time}`);
                }
                return time;
            }

            // my.discord.stats - Statistiques du bot
            else if (line.startsWith('my.discord.stats') && message) {
                await this.getBotStats(message);
            }

            // === NOUVELLES FONCTIONNALITÉS V2.0 ===

            // my.qr.generate - Générateur de QR Code
            else if (line.startsWith('my.qr.generate')) {
                const args = this.parseArguments(line);
                this.variables.set('qr_url', `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(args[0] || 'Discord.my')}`);
            }

            // my.random.quote - Citation aléatoire
            else if (line.startsWith('my.random.quote')) {
                const quotes = [
                    "La créativité, c'est l'intelligence qui s'amuse. - Albert Einstein",
                    "Le succès c'est d'aller d'échec en échec sans perdre son enthousiasme. - Winston Churchill",
                    "L'imagination est plus importante que le savoir. - Albert Einstein",
                    "Le meilleur moment pour planter un arbre c'était il y a 20 ans. Le deuxième meilleur moment c'est maintenant. - Proverbe chinois",
                    "Soyez vous-même, tous les autres sont déjà pris. - Oscar Wilde"
                ];
                this.variables.set('random_quote', quotes[Math.floor(Math.random() * quotes.length)]);
            }

            // my.random.joke - Blague aléatoire
            else if (line.startsWith('my.random.joke')) {
                const jokes = [
                    "Pourquoi les plongeurs plongent-ils toujours en arrière et jamais en avant ? Parce que sinon, ils tombent dans le bateau !",
                    "Que dit un escargot quand il croise une limace ? \"Regarde le nudiste !\"",
                    "Qu'est-ce qui est jaune et qui attend ? Jonathan !",
                    "Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ? Un chat-mallow !",
                    "Pourquoi les poissons n'aiment pas jouer au tennis ? Parce qu'ils ont peur du filet !"
                ];
                this.variables.set('random_joke', jokes[Math.floor(Math.random() * jokes.length)]);
            }

            // my.random.fact - Fait amusant
            else if (line.startsWith('my.random.fact')) {
                const facts = [
                    "Les pieuvres ont trois cœurs et du sang bleu !",
                    "Un groupe de flamants roses s'appelle une \"flamboyance\" !",
                    "Les abeilles peuvent reconnaître les visages humains !",
                    "Le miel ne se périme jamais !",
                    "Les dauphins ont des noms pour s'identifier entre eux !"
                ];
                this.variables.set('random_fact', facts[Math.floor(Math.random() * facts.length)]);
            }

            // my.horoscope - Horoscope
            else if (line.startsWith('my.horoscope')) {
                const args = this.parseArguments(line);
                const predictions = [
                    "Les astres vous sourient aujourd'hui !",
                    "Une belle surprise vous attend !",
                    "Jour idéal pour de nouveaux projets !",
                    "L'amour est dans l'air !",
                    "Votre créativité sera récompensée !"
                ];
                this.variables.set('horoscope', predictions[Math.floor(Math.random() * predictions.length)]);
            }

            // my.game.coinflip - Pile ou face
            else if (line.startsWith('my.game.coinflip')) {
                this.variables.set('coinflip', Math.random() < 0.5 ? '🪙 Face' : '🪙 Pile');
            }

            // my.game.rps - Pierre papier ciseaux
            else if (line.startsWith('my.game.rps')) {
                const args = this.parseArguments(line);
                const choices = ['pierre', 'papier', 'ciseaux'];
                const botChoice = choices[Math.floor(Math.random() * choices.length)];
                const userChoice = args[0]?.toLowerCase();

                let result = '';
                if (userChoice === botChoice) {
                    result = `Égalité ! Nous avons tous les deux choisi ${botChoice} !`;
                } else if (
                    (userChoice === 'pierre' && botChoice === 'ciseaux') ||
                    (userChoice === 'papier' && botChoice === 'pierre') ||
                    (userChoice === 'ciseaux' && botChoice === 'papier')
                ) {
                    result = `Vous gagnez ! ${userChoice} bat ${botChoice} !`;
                } else {
                    result = `Je gagne ! ${botChoice} bat ${userChoice} !`;
                }
                this.variables.set('rps_result', result);
            }

            // my.game.8ball - Boule magique
            else if (line.startsWith('my.game.8ball')) {
                const answers = [
                    "🎱 C'est certain !",
                    "🎱 Sans aucun doute !",
                    "🎱 Oui définitivement !",
                    "🎱 Vous pouvez compter dessus !",
                    "🎱 Très probable !",
                    "🎱 Les signes pointent vers oui !",
                    "🎱 Réponse floue, réessayez !",
                    "🎱 Demandez plus tard !",
                    "🎱 Mieux vaut ne pas vous le dire maintenant !",
                    "🎱 Peu probable !",
                    "🎱 Mes sources disent non !",
                    "🎱 Très douteux !"
                ];
                this.variables.set('8ball_answer', answers[Math.floor(Math.random() * answers.length)]);
            }

            // my.economy.balance - Solde économique
            else if (line.startsWith('my.economy.balance')) {
                const args = this.parseArguments(line);
                const userId = args[0] || 'user';
                const balance = Math.floor(Math.random() * 1000) + 100;
                this.variables.set('user_balance', `💰 ${balance} Maya Coins`);
            }

            // my.economy.daily - Bonus quotidien
            else if (line.startsWith('my.economy.daily')) {
                const dailyBonus = Math.floor(Math.random() * 100) + 50;
                this.variables.set('daily_bonus', `🎁 Vous avez reçu ${dailyBonus} Maya Coins !`);
            }

            // my.url.shorten - Raccourcisseur d'URL
            else if (line.startsWith('my.url.shorten')) {
                const args = this.parseArguments(line);
                const originalUrl = args[0];
                // Simulation d'un raccourcisseur d'URL
                const shortId = Math.random().toString(36).substring(2, 8);
                this.variables.set('short_url', `https://maya.ly/${shortId}`);
            }

            // my.password.generate - Générateur de mot de passe
            else if (line.startsWith('my.password.generate')) {
                const args = this.parseArguments(line);
                const length = parseInt(args[0]) || 12;
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
                let password = '';
                for (let i = 0; i < length; i++) {
                    password += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                this.variables.set('generated_password', `🔐 ${password}`);
            }

            // my.base64.encode - Encodage Base64
            else if (line.startsWith('my.base64.encode')) {
                const args = this.parseArguments(line);
                const text = args[0] || '';
                this.variables.set('base64_encoded', Buffer.from(text).toString('base64'));
            }

            // my.base64.decode - Décodage Base64
            else if (line.startsWith('my.base64.decode')) {
                const args = this.parseArguments(line);
                const encoded = args[0] || '';
                try {
                    this.variables.set('base64_decoded', Buffer.from(encoded, 'base64').toString('utf8'));
                } catch (error) {
                    this.variables.set('base64_decoded', 'Erreur de décodage');
                }
            }

            // my.weather - Informations météo (simulation)
            else if (line.startsWith('my.weather')) {
                const args = this.parseArguments(line);
                const city = args[0] || 'Paris';
                const temp = Math.floor(Math.random() * 30) + 5;
                const conditions = ['☀️ Ensoleillé', '⛅ Nuageux', '🌧️ Pluvieux', '❄️ Neigeux', '🌤️ Partiellement nuageux'];
                const condition = conditions[Math.floor(Math.random() * conditions.length)];
                this.variables.set('weather_info', `🌡️ ${temp}°C à ${city} - ${condition}`);
            }

            // my.translate - Traducteur (simulation)
            else if (line.startsWith('my.translate')) {
                const args = this.parseArguments(line);
                const text = args[0] || '';
                const fromLang = args[1] || 'en';
                const toLang = args[2] || 'fr';

                // Traductions simples simulées
                const translations = {
                    'hello': 'bonjour',
                    'goodbye': 'au revoir',
                    'thank you': 'merci',
                    'yes': 'oui',
                    'no': 'non'
                };

                const translated = translations[text.toLowerCase()] || `[Traduit de ${fromLang} vers ${toLang}] ${text}`;
                this.variables.set('translated_text', translated);
            }

            // my.level.check - Vérifier le niveau
            else if (line.startsWith('my.level.check')) {
                const args = this.parseArguments(line);
                const level = Math.floor(Math.random() * 50) + 1;
                const xp = Math.floor(Math.random() * 1000) + 100;
                this.variables.set('user_level', `📊 Niveau ${level} - ${xp} XP`);
            }

            // my.reminder.set - Définir un rappel
            else if (line.startsWith('my.reminder.set')) {
                const args = this.parseArguments(line);
                const user = args[0] || 'utilisateur';
                const time = args[1] || '5m';
                const reminder = args[2] || 'Rappel !';
                this.variables.set('reminder_set', `⏰ Rappel défini pour ${user} dans ${time}: ${reminder}`);
            }

            // my.event.create - Créer un événement
            else if (line.startsWith('my.event.create')) {
                const args = this.parseArguments(line);
                const eventName = args[0] || 'Événement';
                const date = args[1] || 'Bientôt';
                const description = args[2] || 'Description de l\'événement';
                this.variables.set('event_created', `📅 Événement "${eventName}" créé pour le ${date}: ${description}`);
            }

            console.log(`💬 ${line}`);

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
            name: name,
            response: response,
            options: options,
            embed: null,
            actions: [],
            kickParams: null,
            banParams: null,
            dmParams: null,
            pollParams: null,
            reactionParams: null,
            muteParams: null,
            purgeParams: null
        });
        console.log(`📝 Commande créée: ${this.prefix}${name}`);
    }

    // Exécuter une commande
    async executeCommand(command, message, args) {
        try {
            // Exécuter les actions de la commande
            for (const action of command.actions) {
                await this.interpretLine(action, message);
            }

            // Exécuter les actions spécifiques avec paramètres
            if (command.kickParams) {
                const target = command.kickParams.target === 'args[0]' ? args[0] : command.kickParams.target;
                await this.kickMember(message, target, command.kickParams.reason);
            }

            if (command.banParams) {
                const target = command.banParams.target === 'args[0]' ? args[0] : command.banParams.target;
                await this.banMember(message, target, command.banParams.reason);
            }

            if (command.dmParams) {
                const target = command.dmParams.target === 'args[0]' ? args[0] : command.dmParams.target;
                let dmMessage = command.dmParams.message;
                // Remplacer les variables dans le message
                for (const [key, value] of this.variables.entries()) {
                    dmMessage = dmMessage.replace(new RegExp(`{${key}}`, 'g'), value);
                }
                await this.sendDM(message, target, dmMessage);
            }

            if (command.pollParams) {
                await this.createPoll(message, command.pollParams.question, command.pollParams.options);
            }

            if (command.reactionParams) {
                await message.react(command.reactionParams.emoji);
            }

            if (command.muteParams) {
                const target = command.muteParams.target === 'args[0]' ? args[0] : command.muteParams.target;
                await this.muteMember(message, target, command.muteParams.duration, command.muteParams.reason);
            }

            if (command.purgeParams) {
                const amount = command.purgeParams.amount === 'args[0]' ? args[0] : command.purgeParams.amount;
                await this.purgeMessages(message, amount);
            }

            // Envoyer l'embed si défini
            if (command.embed) {
                await this.sendEmbed(message, command.embed);
            } 
            // Sinon envoyer la réponse normale
            else if (command.response && command.response !== 'embed') {
                let response = command.response;
                // Remplacer les variables dans la réponse
                for (const [key, value] of this.variables.entries()) {
                    response = response.replace(new RegExp(`{${key}}`, 'g'), value);
                }
                await message.reply(response);
            }
        } catch (error) {
            console.error(`❌ Erreur lors de l'exécution de la commande ${command.name}:`, error);
            await message.reply('❌ Une erreur est survenue lors de l\'exécution de la commande.');
        }
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
                case 'image':```tool_code
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

        // Remplacer les variables dans les champs de l'embed
        if (embed.data.title) {
            embed.data.title = this.replaceVariables(embed.data.title, message);
        }
        if (embed.data.description) {
            embed.data.description = this.replaceVariables(embed.data.description, message);
        }
        if (embed.data.footer && embed.data.footer.text) {
            embed.data.footer.text = this.replaceVariables(embed.data.footer.text, message);
        }
        if (embed.data.author && embed.data.author.name) {
            embed.data.author.name = this.replaceVariables(embed.data.author.name, message);
        }

        await message.reply({ embeds: [embed] });
    }

    // Fonction pour remplacer les variables
    replaceVariables(text, message) {
        if (!text) return text;

        // Remplacer les variables dans le texte
        text = text.replace(/{(\w+)}/g, (match, varName) => {
            return this.variables.get(varName) || match;
        });

        // Variables spéciales
        text = text.replace(/{user}/g, message?.author?.username || 'Utilisateur');
        text = text.replace(/{server}/g, message?.guild?.name || 'Serveur');
        text = text.replace(/{channel}/g, message?.channel?.name || 'Channel');
        text = text.replace(/{member_count}/g, message?.guild?.memberCount || '0');

        return text;
    }

    // Obtenir une image aléatoire depuis une API
    async getRandomImage(category) {
        const images = {
            'cats': [
                'https://cataas.com/cat',
                'https://cdn2.thecatapi.com/images/9p1.jpg',
                'https://cdn2.thecatapi.com/images/1sq.jpg'
            ],
            'dogs': [
                'https://dog.ceo/api/img/vizsla/n02100583_10508.jpg',
                'https://dog.ceo/api/img/hound-english/n02089973_2309.jpg',
                'https://dog.ceo/api/img/spaniel-brittany/n02101388_5739.jpg'
            ],
            'foxes': [
                'https://randomfox.ca/images/1.jpg',
                'https://randomfox.ca/images/2.jpg',
                'https://randomfox.ca/images/3.jpg'
            ],
            'memes': [
                'https://i.imgflip.com/1bij.jpg',
                'https://i.imgflip.com/30b1gx.jpg',
                'https://i.imgflip.com/26am.jpg'
            ],
            'anime': [
                'https://cdn.waifu.pics/sfw/neko/1.jpg',
                'https://cdn.waifu.pics/sfw/neko/2.jpg',
                'https://cdn.waifu.pics/sfw/neko/3.jpg'
            ]
        };

        try {
            const categoryImages = images[category.toLowerCase()] || images.cats;
            const randomIndex = Math.floor(Math.random() * categoryImages.length);
            return categoryImages[randomIndex];
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

    // Obtenir les informations du serveur
    async getServerInfo(message) {
        const guild = message.guild;
        const embed = new EmbedBuilder()
            .setTitle(`🏰 Informations du serveur: ${guild.name}`)
            .setDescription(`**ID:** ${guild.id}\n**Propriétaire:** <@${guild.ownerId}>\n**Membres:** ${guild.memberCount}\n**Canaux:** ${guild.channels.cache.size}\n**Rôles:** ${guild.roles.cache.size}\n**Créé le:** ${guild.createdAt.toLocaleDateString('fr-FR')}`)
            .setColor('#3498db')
            .setThumbnail(guild.iconURL() || null)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Obtenir les informations d'un utilisateur
    async getUserInfo(message, userMention) {
        let user;
        if (userMention) {
            const userId = userMention.replace(/[<@!>]/g, '');
            user = message.guild.members.cache.get(userId)?.user || message.client.users.cache.get(userId);
        } else {
            user = message.author;
        }

        if (!user) {
            await message.reply('❌ Utilisateur introuvable.');
            return;
        }

        const member = message.guild.members.cache.get(user.id);
        const embed = new EmbedBuilder()
            .setTitle(`👤 Informations: ${user.tag}`)
            .setDescription(`**ID:** ${user.id}\n**Créé le:** ${user.createdAt.toLocaleDateString('fr-FR')}\n**A rejoint le:** ${member ? member.joinedAt.toLocaleDateString('fr-FR') : 'N/A'}\n**Bot:** ${user.bot ? 'Oui' : 'Non'}`)
            .setColor('#e74c3c')
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Mute un membre
    async muteMember(message, userMention, duration = '10m', reason = 'Aucune raison spécifiée') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            await message.reply('❌ Vous n\'avez pas les permissions pour mute des membres.');
            return;
        }

        const userId = userMention.replace(/[<@!>]/g, '');
        const member = message.guild.members.cache.get(userId);

        if (!member) {
            await message.reply('❌ Membre introuvable.');
            return;
        }

        // Convertir la durée en millisecondes
        const timeUnits = { 's': 1000, 'm': 60000, 'h': 3600000, 'd': 86400000 };
        const unit = duration.slice(-1);
        const time = parseInt(duration.slice(0, -1)) * (timeUnits[unit] || 60000);

        try {
            await member.timeout(time, reason);
            await message.reply(`🔇 ${member.user.tag} a été mute pour ${duration}. Raison: ${reason}`);
        } catch (error) {
            await message.reply('❌ Impossible de mute ce membre.');
        }
    }

    // Supprimer des messages
    async purgeMessages(message, amount = '10') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            await message.reply('❌ Vous n\'avez pas les permissions pour supprimer des messages.');
            return;
        }

        const deleteCount = parseInt(amount);
        if (isNaN(deleteCount) || deleteCount <= 0 || deleteCount > 100) {
            await message.reply('❌ Veuillez fournir un nombre entre 1 et 100.');
            return;
        }

        try {
            const messages = await message.channel.messages.fetch({ limit: deleteCount });
            await message.channel.bulkDelete(messages);

            const confirmMessage = await message.reply(`🗑️ ${deleteCount} messages supprimés.`);
            setTimeout(() => confirmMessage.delete().catch(() => {}), 5000);
        } catch (error) {
            await message.reply('❌ Erreur lors de la suppression des messages.');
        }
    }

    // Obtenir l'avatar d'un utilisateur
    async getUserAvatar(message, userMention) {
        let user;
        if (userMention) {
            const userId = userMention.replace(/[<@!>]/g, '');
            user = message.guild.members.cache.get(userId)?.user || message.client.users.cache.get(userId);
        } else {
            user = message.author;
        }

        if (!user) {
            await message.reply('❌ Utilisateur introuvable.');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🖼️ Avatar de ${user.tag}`)
            .setImage(user.displayAvatarURL({ size: 512 }))
            .setColor('#9b59b6')
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Interpréter un fichier .my
    async interpretFile(filename) {
        try {
            const content = fs.readFileSync(filename, 'utf8');
            const lines = content.split('\n');

            console.log(`🚀 Démarrage du bot Discord.my depuis ${filename}`);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                await this.interpretLine(line);

                // Gérer les embeds qui suivent une commande
                if (line.startsWith('my.discord.command') && i + 1 < lines.length) {
                    let nextLineIndex = i + 1;
                    // Chercher les embeds et actions qui suivent
                    while (nextLineIndex < lines.length) {
                        const nextLine = lines[nextLineIndex].trim();
                        if (nextLine.startsWith('my.discord.embed') || 
                            nextLine.startsWith('my.random.') ||
                            nextLine.startsWith('my.math.') ||
                            nextLine.startsWith('my.time.')) {
                            await this.interpretLine(nextLine);
                            i = nextLineIndex; // Avancer l'index principal
                            nextLineIndex++;
                        } else if (nextLine && !nextLine.startsWith('//') && !nextLine.startsWith('my.discord.command')) {
                            // Ligne non reconnue, arrêter
                            break;
                        } else {
                            break;
                        }
                    }
                }
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

    // Statistiques du bot
    async getBotStats(message) {
        const uptime = process.uptime();
        const uptimeString = this.formatUptime(uptime);

        const embed = new EmbedBuilder()
            .setTitle('🤖 Statistiques du bot')
            .addFields(
                { name: '⏱️ Uptime', value: uptimeString, inline: true },
                { name: '💾 Mémoire utilisée', value: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
                { name: '👥 Serveurs', value: `${this.client.guilds.cache.size}`, inline: true },
                { name: '🏓 Ping', value: `${this.client.ws.ping}ms`, inline: true }
            )
            .setColor('#2ecc71')
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Formater l'uptime
    formatUptime(seconds) {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor(seconds % (3600 * 24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        const s = Math.floor(seconds % 60);

        const dDisplay = d > 0 ? d + (d === 1 ? " jour, " : " jours, ") : "";
        const hDisplay = h > 0 ? h + (h === 1 ? " heure, " : " heures, ") : "";
        const mDisplay = m > 0 ? m + (m === 1 ? " minute, " : " minutes, ") : "";
        const sDisplay = s > 0 ? s + (s === 1 ? " seconde" : " secondes") : "";
        return dDisplay + hDisplay + mDisplay + sDisplay;
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