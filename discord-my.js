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
            else if (line.startsWith('my.discord.kick')) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de kick dans la commande
                    this.commands.get(this.currentCommand).kickParams = {
                        target: args[0] || 'args[0]',
                        reason: args[1] || 'Aucune raison spécifiée'
                    };
                } else if (message) {
                    await this.kickMember(message, args[0], args[1]);
                }
            }

            // my.discord.ban - Ban un membre
            else if (line.startsWith('my.discord.ban')) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de ban dans la commande
                    this.commands.get(this.currentCommand).banParams = {
                        target: args[0] || 'args[0]',
                        reason: args[1] || 'Aucune raison spécifiée'
                    };
                } else if (message) {
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
            else if (line.startsWith('my.discord.dm')) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de DM dans la commande
                    this.commands.get(this.currentCommand).dmParams = {
                        target: args[0] || 'args[0]',
                        message: args[1] || 'Message par défaut'
                    };
                } else if (message && args.length >= 2) {
                    await this.sendDM(message, args[0], args[1]);
                }
            }

            // my.discord.role - Gérer les rôles
            else if (line.startsWith('my.discord.role')) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de rôle dans la commande
                    this.commands.get(this.currentCommand).roleParams = {
                        action: args[0] || 'add',
                        target: args[1] || 'args[0]',
                        role: args[2] || 'Membre'
                    };
                } else if (message && args.length >= 3) {
                    await this.manageRole(message, args[1], args[0], args[2]);
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
            else if (line.startsWith('my.discord.poll')) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de sondage dans la commande
                    this.commands.get(this.currentCommand).pollParams = {
                        question: args[0] || 'Sondage',
                        options: args.slice(1)
                    };
                } else if (message && args.length >= 2) {
                    await this.createPoll(message, args[0], args.slice(1));
                }
            }

            // my.discord.react - Ajouter une réaction (corriger le nom)
            else if (line.startsWith('my.discord.react')) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    // Stocker les paramètres de réaction dans la commande
                    this.commands.get(this.currentCommand).reactionParams = {
                        emojis: args.length > 0 ? args : ['👍']
                    };
                } else if (message && args.length > 0) {
                    for (const emoji of args) {
                        try {
                            await message.react(emoji);
                        } catch (error) {
                            console.error(`Erreur lors de l'ajout de la réaction ${emoji}:`, error);
                        }
                    }
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

            // === NOUVELLES FONCTIONNALITÉS ÉCONOMIE AVANCÉE ===

            // my.economy.shop - Boutique virtuelle
            else if (line.startsWith('my.economy.shop')) {
                const items = ['🎮 Jeu Vidéo (500 coins)', '🍕 Pizza (50 coins)', '🎨 Artwork (200 coins)', '🎵 Musique Premium (150 coins)', '⭐ Badge VIP (1000 coins)'];
                this.variables.set('shop_items', items.join('\n'));
            }

            // my.economy.buy - Acheter un item
            else if (line.startsWith('my.economy.buy')) {
                const args = this.parseArguments(line);
                const item = args[0] || 'item';
                const cost = Math.floor(Math.random() * 500) + 50;
                this.variables.set('purchase_result', `🛒 Vous avez acheté ${item} pour ${cost} Maya Coins!`);
            }

            // my.economy.inventory - Inventaire utilisateur
            else if (line.startsWith('my.economy.inventory')) {
                const items = ['🎮 Jeu Vidéo x2', '🍕 Pizza x5', '🎨 Artwork x1', '⭐ Badge VIP x1'];
                this.variables.set('user_inventory', items.join('\n'));
            }

            // my.economy.trade - Échange entre utilisateurs
            else if (line.startsWith('my.economy.trade')) {
                const args = this.parseArguments(line);
                const user = args[0] || 'utilisateur';
                const item = args[1] || 'item';
                this.variables.set('trade_offer', `🔄 Proposition d'échange avec ${user}: ${item}`);
            }

            // my.economy.lottery - Loterie
            else if (line.startsWith('my.economy.lottery')) {
                const numbers = Array.from({length: 6}, () => Math.floor(Math.random() * 49) + 1);
                const winnings = Math.random() < 0.1 ? Math.floor(Math.random() * 10000) + 1000 : 0;
                this.variables.set('lottery_result', `🎰 Numéros: ${numbers.join('-')} | Gains: ${winnings} coins`);
            }

            // my.economy.bank - Banque virtuelle
            else if (line.startsWith('my.economy.bank')) {
                const args = this.parseArguments(line);
                const action = args[0] || 'balance';
                const amount = args[1] || '0';
                
                if (action === 'deposit') {
                    this.variables.set('bank_action', `🏦 Dépôt de ${amount} coins effectué avec succès!`);
                } else if (action === 'withdraw') {
                    this.variables.set('bank_action', `🏦 Retrait de ${amount} coins effectué avec succès!`);
                } else {
                    const balance = Math.floor(Math.random() * 5000) + 500;
                    this.variables.set('bank_action', `🏦 Solde bancaire: ${balance} coins`);
                }
            }

            // === JEUX AVANCÉS ===

            // my.game.blackjack - Blackjack
            else if (line.startsWith('my.game.blackjack')) {
                const playerCards = [Math.floor(Math.random() * 11) + 1, Math.floor(Math.random() * 11) + 1];
                const dealerCard = Math.floor(Math.random() * 11) + 1;
                const playerTotal = playerCards.reduce((a, b) => a + b, 0);
                this.variables.set('blackjack_game', `🃏 Vos cartes: ${playerCards.join(', ')} (Total: ${playerTotal})\n🎲 Carte visible du croupier: ${dealerCard}`);
            }

            // my.game.slots - Machine à sous
            else if (line.startsWith('my.game.slots')) {
                const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎'];
                const result = [
                    symbols[Math.floor(Math.random() * symbols.length)],
                    symbols[Math.floor(Math.random() * symbols.length)],
                    symbols[Math.floor(Math.random() * symbols.length)]
                ];
                const isWin = result[0] === result[1] && result[1] === result[2];
                this.variables.set('slots_result', `🎰 ${result.join(' | ')} ${isWin ? '🎉 JACKPOT!' : '❌ Perdu!'}`);
            }

            // my.game.poker - Poker simple
            else if (line.startsWith('my.game.poker')) {
                const suits = ['♠️', '♥️', '♦️', '♣️'];
                const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
                const hand = Array.from({length: 5}, () => 
                    `${values[Math.floor(Math.random() * values.length)]}${suits[Math.floor(Math.random() * suits.length)]}`
                );
                this.variables.set('poker_hand', `🃏 Votre main: ${hand.join(' ')}`);
            }

            // my.game.quiz - Quiz interactif
            else if (line.startsWith('my.game.quiz')) {
                const questions = [
                    { q: "Quelle est la capitale de la France?", a: "Paris" },
                    { q: "Combien font 2+2?", a: "4" },
                    { q: "Quel est le plus grand océan?", a: "Pacifique" },
                    { q: "En quelle année a été créé Discord?", a: "2015" }
                ];
                const quiz = questions[Math.floor(Math.random() * questions.length)];
                this.variables.set('quiz_question', quiz.q);
                this.variables.set('quiz_answer', quiz.a);
            }

            // my.game.trivia - Culture générale
            else if (line.startsWith('my.game.trivia')) {
                const trivias = [
                    "Les dauphins dorment avec un œil ouvert!",
                    "Une journée sur Vénus dure plus longtemps qu'une année!",
                    "Les bananes sont radioactives!",
                    "Il y a plus d'arbres sur Terre que d'étoiles dans la Voie lactée!",
                    "Le cœur d'une crevette est dans sa tête!"
                ];
                this.variables.set('trivia_fact', trivias[Math.floor(Math.random() * trivias.length)]);
            }

            // === FONCTIONNALITÉS IA ET AUTOMATISATION ===

            // my.ai.chatbot - Chatbot simple
            else if (line.startsWith('my.ai.chatbot')) {
                const args = this.parseArguments(line);
                const input = args[0] || 'hello';
                const responses = {
                    'hello': 'Bonjour! Comment puis-je vous aider?',
                    'how are you': 'Je vais très bien, merci!',
                    'goodbye': 'Au revoir! Passez une excellente journée!',
                    'help': 'Je peux vous aider avec diverses tâches!'
                };
                this.variables.set('chatbot_response', responses[input.toLowerCase()] || 'Je ne comprends pas cette question.');
            }

            // my.ai.sentiment - Analyse de sentiment
            else if (line.startsWith('my.ai.sentiment')) {
                const args = this.parseArguments(line);
                const text = args[0] || '';
                const positiveWords = ['super', 'génial', 'excellent', 'fantastique', 'merveilleux'];
                const negativeWords = ['nul', 'horrible', 'terrible', 'affreux', 'mauvais'];
                
                let sentiment = 'neutre 😐';
                if (positiveWords.some(word => text.toLowerCase().includes(word))) {
                    sentiment = 'positif 😊';
                } else if (negativeWords.some(word => text.toLowerCase().includes(word))) {
                    sentiment = 'négatif 😞';
                }
                this.variables.set('sentiment_analysis', `Sentiment détecté: ${sentiment}`);
            }

            // my.ai.autocomplete - Autocomplétion
            else if (line.startsWith('my.ai.autocomplete')) {
                const args = this.parseArguments(line);
                const prefix = args[0] || '';
                const suggestions = [
                    `${prefix}tion`, `${prefix}ment`, `${prefix}able`, `${prefix}ique`, `${prefix}eur`
                ];
                this.variables.set('autocomplete_suggestions', suggestions.join(', '));
            }

            // === RÉSEAUX SOCIAUX ET COMMUNAUTÉ ===

            // my.social.follow - Système de suivi
            else if (line.startsWith('my.social.follow')) {
                const args = this.parseArguments(line);
                const user = args[0] || 'utilisateur';
                this.variables.set('follow_status', `✅ Vous suivez maintenant ${user}!`);
            }

            // my.social.feed - Fil d'actualité
            else if (line.startsWith('my.social.feed')) {
                const posts = [
                    "👤 Alice a partagé une nouvelle photo!",
                    "🎮 Bob joue maintenant à Minecraft!",
                    "🎵 Charlie écoute de la musique!",
                    "📚 Diana lit un nouveau livre!",
                    "🍕 Eve mange une délicieuse pizza!"
                ];
                this.variables.set('social_feed', posts.join('\n'));
            }

            // my.social.like - Système de likes
            else if (line.startsWith('my.social.like')) {
                const args = this.parseArguments(line);
                const post = args[0] || 'publication';
                const likes = Math.floor(Math.random() * 100) + 1;
                this.variables.set('like_status', `❤️ Vous avez aimé ${post}! (${likes} likes au total)`);
            }

            // my.social.share - Partage de contenu
            else if (line.startsWith('my.social.share')) {
                const args = this.parseArguments(line);
                const content = args[0] || 'contenu';
                this.variables.set('share_status', `🔄 Contenu partagé: ${content}`);
            }

            // my.social.trending - Tendances
            else if (line.startsWith('my.social.trending')) {
                const trends = ['#DiscordMy', '#Gaming', '#Musique', '#Art', '#Programmation', '#Memes', '#Tech'];
                this.variables.set('trending_topics', trends.join(' '));
            }

            // === PRODUCTIVITÉ ET ORGANISATION ===

            // my.todo.add - Ajouter une tâche
            else if (line.startsWith('my.todo.add')) {
                const args = this.parseArguments(line);
                const task = args[0] || 'nouvelle tâche';
                this.variables.set('todo_added', `✅ Tâche ajoutée: ${task}`);
            }

            // my.todo.list - Lister les tâches
            else if (line.startsWith('my.todo.list')) {
                const tasks = [
                    "📝 Terminer le projet",
                    "🛒 Faire les courses",
                    "📚 Étudier Discord.my",
                    "🎮 Jouer avec les amis",
                    "💻 Coder le bot"
                ];
                this.variables.set('todo_list', tasks.join('\n'));
            }

            // my.calendar.event - Événement calendrier
            else if (line.startsWith('my.calendar.event')) {
                const args = this.parseArguments(line);
                const event = args[0] || 'Événement';
                const date = args[1] || 'Aujourd\'hui';
                this.variables.set('calendar_event', `📅 ${event} programmé pour ${date}`);
            }

            // my.notes.create - Créer une note
            else if (line.startsWith('my.notes.create')) {
                const args = this.parseArguments(line);
                const note = args[0] || 'Ma note';
                this.variables.set('note_created', `📝 Note créée: ${note}`);
            }

            // my.timer.start - Démarrer un minuteur
            else if (line.startsWith('my.timer.start')) {
                const args = this.parseArguments(line);
                const duration = args[0] || '5m';
                this.variables.set('timer_started', `⏱️ Minuteur démarré pour ${duration}`);
            }

            // === DIVERTISSEMENT AVANCÉ ===

            // my.entertainment.movie - Recommandation de film
            else if (line.startsWith('my.entertainment.movie')) {
                const movies = [
                    "🎬 Inception (2010)",
                    "🎬 The Matrix (1999)",
                    "🎬 Interstellar (2014)",
                    "🎬 Pulp Fiction (1994)",
                    "🎬 The Shawshank Redemption (1994)"
                ];
                this.variables.set('movie_recommendation', movies[Math.floor(Math.random() * movies.length)]);
            }

            // my.entertainment.music - Recommandation musicale
            else if (line.startsWith('my.entertainment.music')) {
                const songs = [
                    "🎵 Bohemian Rhapsody - Queen",
                    "🎵 Hotel California - Eagles",
                    "🎵 Stairway to Heaven - Led Zeppelin",
                    "🎵 Imagine - John Lennon",
                    "🎵 Billie Jean - Michael Jackson"
                ];
                this.variables.set('music_recommendation', songs[Math.floor(Math.random() * songs.length)]);
            }

            // my.entertainment.book - Recommandation de livre
            else if (line.startsWith('my.entertainment.book')) {
                const books = [
                    "📚 1984 - George Orwell",
                    "📚 Le Petit Prince - Antoine de Saint-Exupéry",
                    "📚 Harry Potter - J.K. Rowling",
                    "📚 Le Seigneur des Anneaux - J.R.R. Tolkien",
                    "📚 Dune - Frank Herbert"
                ];
                this.variables.set('book_recommendation', books[Math.floor(Math.random() * books.length)]);
            }

            // my.entertainment.podcast - Recommandation de podcast
            else if (line.startsWith('my.entertainment.podcast')) {
                const podcasts = [
                    "🎙️ Podcast Science",
                    "🎙️ 2 Heures de Perdues",
                    "🎙️ Les Regardeurs",
                    "🎙️ Transfert",
                    "🎙️ Meta de Choc"
                ];
                this.variables.set('podcast_recommendation', podcasts[Math.floor(Math.random() * podcasts.length)]);
            }

            // === SÉCURITÉ ET MODÉRATION AVANCÉE ===

            // my.security.scan - Scanner de sécurité
            else if (line.startsWith('my.security.scan')) {
                const threats = Math.floor(Math.random() * 5);
                this.variables.set('security_scan', `🔍 Scan terminé: ${threats} menace(s) détectée(s)`);
            }

            // my.security.antispam - Anti-spam
            else if (line.startsWith('my.security.antispam')) {
                const args = this.parseArguments(line);
                const message = args[0] || '';
                const isSpam = message.length > 100 || /(.)\1{4,}/.test(message);
                this.variables.set('spam_check', isSpam ? '⚠️ Message détecté comme spam!' : '✅ Message valide');
            }

            // my.security.verify - Système de vérification
            else if (line.startsWith('my.security.verify')) {
                const verificationCode = Math.floor(Math.random() * 9000) + 1000;
                this.variables.set('verification_code', `🔐 Code de vérification: ${verificationCode}`);
            }

            // === ANALYSE ET STATISTIQUES ===

            // my.analytics.stats - Statistiques serveur
            else if (line.startsWith('my.analytics.stats')) {
                const stats = {
                    messages: Math.floor(Math.random() * 10000) + 1000,
                    active_users: Math.floor(Math.random() * 500) + 50,
                    channels: Math.floor(Math.random() * 50) + 10
                };
                this.variables.set('server_stats', `📊 Messages: ${stats.messages} | Utilisateurs actifs: ${stats.active_users} | Canaux: ${stats.channels}`);
            }

            // my.analytics.activity - Analyse d'activité
            else if (line.startsWith('my.analytics.activity')) {
                const hours = Array.from({length: 24}, (_, i) => `${i}h: ${Math.floor(Math.random() * 100)}`);
                this.variables.set('activity_graph', hours.slice(0, 5).join(', ') + '...');
            }

            // === INTÉGRATIONS EXTERNES ===

            // my.api.github - Intégration GitHub
            else if (line.startsWith('my.api.github')) {
                const args = this.parseArguments(line);
                const repo = args[0] || 'mon-repo';
                this.variables.set('github_info', `🐙 Repo: ${repo} | ⭐ 42 stars | 🍴 15 forks`);
            }

            // my.api.youtube - Intégration YouTube
            else if (line.startsWith('my.api.youtube')) {
                const args = this.parseArguments(line);
                const query = args[0] || 'discord bot';
                this.variables.set('youtube_search', `🎬 Recherche YouTube: "${query}" - 156 résultats trouvés`);
            }

            // my.api.twitter - Intégration Twitter
            else if (line.startsWith('my.api.twitter')) {
                const tweets = [
                    "🐦 Discord.my est incroyable! #coding",
                    "🐦 Nouveau bot créé aujourd'hui! #discord",
                    "🐦 La programmation c'est fantastique! #dev"
                ];
                this.variables.set('latest_tweet', tweets[Math.floor(Math.random() * tweets.length)]);
            }

            // === UTILITAIRES AVANCÉS ===

            // my.utils.color - Générateur de couleurs
            else if (line.startsWith('my.utils.color')) {
                const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF'];
                this.variables.set('random_color', colors[Math.floor(Math.random() * colors.length)]);
            }

            // my.utils.uuid - Générateur UUID
            else if (line.startsWith('my.utils.uuid')) {
                const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
                this.variables.set('generated_uuid', uuid);
            }

            // my.utils.hash - Hachage simple
            else if (line.startsWith('my.utils.hash')) {
                const args = this.parseArguments(line);
                const text = args[0] || 'hello';
                let hash = 0;
                for (let i = 0; i < text.length; i++) {
                    const char = text.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                this.variables.set('text_hash', Math.abs(hash).toString(16));
            }

            // my.utils.encode - Encodage URL
            else if (line.startsWith('my.utils.encode')) {
                const args = this.parseArguments(line);
                const text = args[0] || '';
                this.variables.set('encoded_url', encodeURIComponent(text));
            }

            // my.utils.decode - Décodage URL
            else if (line.startsWith('my.utils.decode')) {
                const args = this.parseArguments(line);
                const text = args[0] || '';
                try {
                    this.variables.set('decoded_url', decodeURIComponent(text));
                } catch {
                    this.variables.set('decoded_url', 'Erreur de décodage');
                }
            }

            // === NOTIFICATIONS ET ALERTES ===

            // my.notification.create - Créer notification
            else if (line.startsWith('my.notification.create')) {
                const args = this.parseArguments(line);
                const title = args[0] || 'Notification';
                const message = args[1] || 'Message par défaut';
                this.variables.set('notification', `🔔 ${title}: ${message}`);
            }

            // my.alert.send - Envoyer alerte
            else if (line.startsWith('my.alert.send')) {
                const args = this.parseArguments(line);
                const type = args[0] || 'info';
                const message = args[1] || 'Alerte';
                const emoji = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
                this.variables.set('alert_message', `${emoji} ${message}`);
            }

            // === PERSONNALISATION ===

            // my.theme.set - Définir thème
            else if (line.startsWith('my.theme.set')) {
                const args = this.parseArguments(line);
                const theme = args[0] || 'default';
                const themes = {
                    'dark': '🌙 Thème sombre activé',
                    'light': '☀️ Thème clair activé',
                    'neon': '✨ Thème néon activé',
                    'retro': '📺 Thème rétro activé'
                };
                this.variables.set('theme_status', themes[theme] || '🎨 Thème par défaut');
            }

            // my.profile.customize - Personnaliser profil
            else if (line.startsWith('my.profile.customize')) {
                const args = this.parseArguments(line);
                const element = args[0] || 'avatar';
                this.variables.set('profile_update', `✨ ${element} de profil mis à jour!`);
            }

            // === MINI-JEUX CRÉATIFS ===

            // my.game.riddle - Devinettes
            else if (line.startsWith('my.game.riddle')) {
                const riddles = [
                    { q: "Je suis blanc quand je suis sale. Que suis-je?", a: "Un tableau noir" },
                    { q: "Plus on m'enlève, plus je deviens grand. Que suis-je?", a: "Un trou" },
                    { q: "Je commence la nuit et termine le matin. Que suis-je?", a: "La lettre N" }
                ];
                const riddle = riddles[Math.floor(Math.random() * riddles.length)];
                this.variables.set('riddle_question', riddle.q);
                this.variables.set('riddle_answer', riddle.a);
            }

            // my.game.wordchain - Chaîne de mots
            else if (line.startsWith('my.game.wordchain')) {
                const args = this.parseArguments(line);
                const lastWord = args[0] || 'discord';
                const lastLetter = lastWord.slice(-1);
                const suggestions = [`${lastLetter}obot`, `${lastLetter}rogrammation`, `${lastLetter}nalogue`];
                this.variables.set('word_suggestion', suggestions[Math.floor(Math.random() * suggestions.length)]);
            }

            // my.game.memory - Jeu de mémoire
            else if (line.startsWith('my.game.memory')) {
                const sequence = Array.from({length: 5}, () => Math.floor(Math.random() * 9) + 1);
                this.variables.set('memory_sequence', `🧠 Mémorisez: ${sequence.join(' ')}`);
            }

            // === ÉDUCATION ET APPRENTISSAGE ===

            // my.learn.vocabulary - Vocabulaire
            else if (line.startsWith('my.learn.vocabulary')) {
                const words = [
                    "🇫🇷 Bonjour = 🇬🇧 Hello",
                    "🇫🇷 Merci = 🇬🇧 Thank you",
                    "🇫🇷 Au revoir = 🇬🇧 Goodbye",
                    "🇫🇷 Oui = 🇬🇧 Yes",
                    "🇫🇷 Non = 🇬🇧 No"
                ];
                this.variables.set('vocab_word', words[Math.floor(Math.random() * words.length)]);
            }

            // my.learn.math - Exercices de maths
            else if (line.startsWith('my.learn.math')) {
                const a = Math.floor(Math.random() * 20) + 1;
                const b = Math.floor(Math.random() * 20) + 1;
                const operations = ['+', '-', '*'];
                const op = operations[Math.floor(Math.random() * operations.length)];
                this.variables.set('math_exercise', `🧮 Calculez: ${a} ${op} ${b} = ?`);
            }

            // my.learn.coding - Conseils de programmation
            else if (line.startsWith('my.learn.coding')) {
                const tips = [
                    "💡 Toujours commenter votre code!",
                    "💡 Utilisez des noms de variables explicites!",
                    "💡 Testez votre code régulièrement!",
                    "💡 La pratique rend parfait!",
                    "💡 Apprenez de vos erreurs!"
                ];
                this.variables.set('coding_tip', tips[Math.floor(Math.random() * tips.length)]);
            }

            // === WELLNESS ET SANTÉ ===

            // my.wellness.meditation - Méditation guidée
            else if (line.startsWith('my.wellness.meditation')) {
                const meditations = [
                    "🧘‍♀️ Respirez profondément pendant 5 minutes",
                    "🧘‍♀️ Concentrez-vous sur votre respiration",
                    "🧘‍♀️ Videz votre esprit de toute pensée",
                    "🧘‍♀️ Imaginez un lieu paisible"
                ];
                this.variables.set('meditation_guide', meditations[Math.floor(Math.random() * meditations.length)]);
            }

            // my.wellness.exercise - Exercices
            else if (line.startsWith('my.wellness.exercise')) {
                const exercises = [
                    "💪 20 pompes",
                    "💪 30 secondes de planche",
                    "💪 15 squats",
                    "💪 10 burpees",
                    "💪 Étirements pendant 2 minutes"
                ];
                this.variables.set('exercise_suggestion', exercises[Math.floor(Math.random() * exercises.length)]);
            }

            // my.wellness.hydration - Rappel hydratation
            else if (line.startsWith('my.wellness.hydration')) {
                this.variables.set('hydration_reminder', '💧 N\'oubliez pas de boire de l\'eau! Restez hydraté!');
            }

            // === CRÉATIVITÉ ET ART ===

            // my.art.palette - Palette de couleurs
            else if (line.startsWith('my.art.palette')) {
                const palettes = [
                    "🎨 Coucher de soleil: #FF6B6B, #FFE66D, #FF8E53",
                    "🎨 Océan: #006BA6, #0496FF, #FFBC42",
                    "🎨 Forêt: #2D5016, #68A357, #A4D17A",
                    "🎨 Pastel: #FFB3C6, #C9A9DD, #A8E6CF"
                ];
                this.variables.set('color_palette', palettes[Math.floor(Math.random() * palettes.length)]);
            }

            // my.art.inspiration - Inspiration artistique
            else if (line.startsWith('my.art.inspiration')) {
                const inspirations = [
                    "🎨 Dessinez votre animal préféré",
                    "🎨 Créez un portrait abstrait",
                    "🎨 Illustrez vos émotions",
                    "🎨 Représentez votre lieu de rêve",
                    "🎨 Mélangez réalisme et fantaisie"
                ];
                this.variables.set('art_inspiration', inspirations[Math.floor(Math.random() * inspirations.length)]);
            }

            // === DÉVELOPPEMENT COMMUNAUTAIRE ===

            // my.community.leaderboard - Classement communauté
            else if (line.startsWith('my.community.leaderboard')) {
                const leaders = [
                    "🥇 Alice - 2,450 points",
                    "🥈 Bob - 2,100 points", 
                    "🥉 Charlie - 1,890 points",
                    "4️⃣ Diana - 1,650 points",
                    "5️⃣ Eve - 1,420 points"
                ];
                this.variables.set('community_leaderboard', leaders.join('\n'));
            }

            // my.community.badge - Système de badges
            else if (line.startsWith('my.community.badge')) {
                const badges = [
                    "🏆 Premier pas",
                    "⭐ Contributeur actif", 
                    "🎯 Expert",
                    "🌟 Légende",
                    "👑 Champion"
                ];
                this.variables.set('earned_badge', badges[Math.floor(Math.random() * badges.length)]);
            }

            // my.community.achievement - Accomplissements
            else if (line.startsWith('my.community.achievement')) {
                const achievements = [
                    "🎉 Premier message envoyé!",
                    "🔥 Série de 7 jours d'activité!",
                    "💬 100 messages envoyés!",
                    "👥 10 amis ajoutés!",
                    "🎮 Premier jeu terminé!"
                ];
                this.variables.set('new_achievement', achievements[Math.floor(Math.random() * achievements.length)]);
            }

            console.log(`💬 ${line}`);

        } catch (error) {
            console.error(`❌ Erreur lors de l'interprétation de la ligne "${line}":`, error.message);
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
                const emojis = command.reactionParams.emojis || [command.reactionParams.emoji || '👍'];
                for (const emoji of emojis) {
                    try {
                        await message.react(emoji);
                    } catch (error) {
                        console.error(`Erreur lors de l'ajout de la réaction ${emoji}:`, error);
                    }
                }
            }

            if (command.muteParams) {
                const target = command.muteParams.target === 'args[0]' ? args[0] : command.muteParams.target;
                await this.muteMember(message, target, command.muteParams.duration, command.muteParams.reason);
            }

            if (command.purgeParams) {
                const amount = command.purgeParams.amount === 'args[0]' ? args[0] : command.purgeParams.amount;
                await this.purgeMessages(message, amount);
            }

            if (command.roleParams) {
                const target = command.roleParams.target === 'args[0]' ? args[0] : command.roleParams.target;
                await this.manageRole(message, target, command.roleParams.action, command.roleParams.role);
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
🤖 Discord.my - Créateur de bots Discord en Maya

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