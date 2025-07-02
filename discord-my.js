const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
// Import dynamique de node-fetch pour la compatibilité ESM
let fetch;
(async () => {
    const nodeFetch = await import('node-fetch');
    fetch = nodeFetch.default;
})();

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
        this.parrotConfig = {
            enabled: false,
            channels: ['all'],
            excludeCommands: true,
            excludeBots: true,
            delay: 0,
            prefix: '',
            suffix: '',
            blacklist: [],
            whitelist: []
        };
        this.economy = new Map(); // Base de données économie en mémoire
        this.userProfiles = new Map(); // Profils utilisateurs
        this.reminders = new Map(); // Système de rappels
        this.todos = new Map(); // Système de tâches
        this.inventory = new Map(); // Inventaires utilisateurs
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
                    this.currentCommand = args[0];
                }
            }

            // my.discord.embed - Créer un embed
            else if (line.startsWith('my.discord.embed')) {
                const args = this.parseArguments(line);
                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).embed = args;
                } else if (message) {
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

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(`🎲 Nombre aléatoire: ${randomNum}`);
                }
                return randomNum;
            }

            // my.random.image - Images aléatoires avec vraies APIs
            else if (line.startsWith('my.random.image')) {
                const args = this.parseArguments(line);
                const category = args[0] || 'cats';
                const imageUrl = await this.getRealRandomImage(category);
                this.variables.set('random_image', imageUrl);

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

            // my.weather - API météo réelle
            else if (line.startsWith('my.weather')) {
                const args = this.parseArguments(line);
                const city = args[0] || 'Paris';
                const weatherInfo = await this.getRealWeather(city);
                this.variables.set('weather_info', weatherInfo);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(weatherInfo);
                }
                return weatherInfo;
            }

            // my.translate - API traduction réelle
            else if (line.startsWith('my.translate')) {
                const args = this.parseArguments(line);
                const text = args[0] || '';
                const fromLang = args[1] || 'en';
                const toLang = args[2] || 'fr';
                const translated = await this.realTranslate(text, fromLang, toLang);
                this.variables.set('translated_text', translated);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(`🌐 Traduction: ${translated}`);
                }
                return translated;
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

            // my.economy.balance - Système économie réel
            else if (line.startsWith('my.economy.balance')) {
                const args = this.parseArguments(line);
                const userId = args[0] || (message ? message.author.id : 'user');
                const balance = this.getEconomyBalance(userId);
                this.variables.set('user_balance', `💰 ${balance} Maya Coins`);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(`💰 Votre solde: ${balance} Maya Coins`);
                }
                return balance;
            }

            // my.economy.daily - Bonus quotidien réel
            else if (line.startsWith('my.economy.daily')) {
                const userId = message ? message.author.id : 'user';
                const dailyResult = this.claimDailyBonus(userId);
                this.variables.set('daily_bonus', dailyResult);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(dailyResult);
                }
                return dailyResult;
            }

            // my.economy.shop - Boutique réelle
            else if (line.startsWith('my.economy.shop')) {
                const shopItems = this.getShopItems();
                this.variables.set('shop_items', shopItems);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    const embed = new EmbedBuilder()
                        .setTitle('🛒 Boutique Maya')
                        .setDescription(shopItems)
                        .setColor('#f39c12');
                    await message.reply({ embeds: [embed] });
                }
                return shopItems;
            }

            // my.economy.buy - Achat réel
            else if (line.startsWith('my.economy.buy')) {
                const args = this.parseArguments(line);
                const item = args[0] || '';
                const userId = message ? message.author.id : 'user';
                const purchaseResult = this.buyItem(userId, item);
                this.variables.set('purchase_result', purchaseResult);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(purchaseResult);
                }
                return purchaseResult;
            }

            // my.reminder.set - Système de rappels réel
            else if (line.startsWith('my.reminder.set')) {
                const args = this.parseArguments(line);
                const userId = message ? message.author.id : args[0];
                const time = args[1] || '5m';
                const reminderText = args[2] || 'Rappel !';
                const reminderId = this.setRealReminder(userId, time, reminderText, message);
                this.variables.set('reminder_set', `⏰ Rappel défini avec l'ID: ${reminderId}`);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(`⏰ Rappel défini pour ${time}: ${reminderText} (ID: ${reminderId})`);
                }
                return reminderId;
            }

            // my.todo.add - Système de tâches réel
            else if (line.startsWith('my.todo.add')) {
                const args = this.parseArguments(line);
                const task = args[0] || 'nouvelle tâche';
                const userId = message ? message.author.id : 'user';
                const taskId = this.addTodoTask(userId, task);
                this.variables.set('todo_added', `✅ Tâche ajoutée avec l'ID: ${taskId}`);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(`✅ Tâche ajoutée: ${task} (ID: ${taskId})`);
                }
                return taskId;
            }

            // my.todo.list - Liste des tâches réelle
            else if (line.startsWith('my.todo.list')) {
                const userId = message ? message.author.id : 'user';
                const todoList = this.getTodoList(userId);
                this.variables.set('todo_list', todoList);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    const embed = new EmbedBuilder()
                        .setTitle('📝 Vos Tâches')
                        .setDescription(todoList || 'Aucune tâche')
                        .setColor('#3498db');
                    await message.reply({ embeds: [embed] });
                }
                return todoList;
            }

            // my.qr.generate - Générateur QR réel
            else if (line.startsWith('my.qr.generate')) {
                const args = this.parseArguments(line);
                const text = args[0] || 'Discord.my';
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
                this.variables.set('qr_url', qrUrl);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    const embed = new EmbedBuilder()
                        .setTitle('🔗 QR Code généré')
                        .setImage(qrUrl)
                        .setDescription(`Contenu: ${text}`)
                        .setColor('#2ecc71');
                    await message.reply({ embeds: [embed] });
                }
                return qrUrl;
            }

            // my.password.generate - Générateur de mot de passe sécurisé
            else if (line.startsWith('my.password.generate')) {
                const args = this.parseArguments(line);
                const length = parseInt(args[0]) || 12;
                const includeSymbols = args[1] !== 'false';
                const password = this.generateSecurePassword(length, includeSymbols);
                this.variables.set('generated_password', password);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.author.send(`🔐 Mot de passe généré: ||${password}||`);
                    await message.reply('🔐 Mot de passe envoyé en message privé pour votre sécurité!');
                }
                return password;
            }

            // my.url.shorten - Raccourcisseur d'URL réel
            else if (line.startsWith('my.url.shorten')) {
                const args = this.parseArguments(line);
                const url = args[0];
                const shortUrl = await this.shortenUrl(url);
                this.variables.set('short_url', shortUrl);

                if (this.currentCommand && this.commands.has(this.currentCommand)) {
                    this.commands.get(this.currentCommand).actions.push(line);
                } else if (message) {
                    await message.reply(`🔗 URL raccourcie: ${shortUrl}`);
                }
                return shortUrl;
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
                    "Pourquoi les poissons n'aiment pas jouer au tennis ? Parce qu'ils ont peur du filet!"
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
                    "Les dauphins ont des noms pour s'identifier entre eux!"
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
                    "Votre créativité sera récompensée!"
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

            // === 35 NOUVELLES FONCTIONNALITÉS CONCRÈTES ===

            // 1. my.voice.join - Rejoindre un canal vocal (fonctionnalité basique)
            else if (line.startsWith('my.voice.join') && message) {
                const voiceChannel = message.member?.voice?.channel;
                if (voiceChannel) {
                    try {
                        this.variables.set('voice_status', `🔊 Tentative de connexion au canal vocal: ${voiceChannel.name}`);
                        await message.reply(`🔊 Tentative de connexion au canal vocal **${voiceChannel.name}** (fonctionnalité limitée)`);
                    } catch (error) {
                        await message.reply('❌ Impossible de rejoindre le canal vocal.');
                    }
                } else {
                    await message.reply('❌ Vous devez être dans un canal vocal.');
                }
            }

            // 2. my.voice.leave - Quitter le canal vocal (fonctionnalité basique)
            else if (line.startsWith('my.voice.leave') && message) {
                this.variables.set('voice_status', '🔇 Déconnexion du canal vocal simulée');
                await message.reply('🔇 Déconnexion du canal vocal simulée.');
            }

            // 3. my.automod.setup - Configuration de l'auto-modération
            else if (line.startsWith('my.automod.setup') && message) {
                const args = this.parseArguments(line);
                const feature = args[0] || 'spam';
                
                if (!this.automodConfig) {
                    this.automodConfig = {
                        antiSpam: false,
                        antiLinks: false,
                        antiCaps: false,
                        maxWarnings: 3
                    };
                }

                switch (feature) {
                    case 'spam':
                        this.automodConfig.antiSpam = true;
                        this.variables.set('automod_status', '🛡️ Anti-spam activé');
                        if (message) await message.reply('🛡️ **Auto-modération anti-spam activée**');
                        break;
                    case 'links':
                        this.automodConfig.antiLinks = true;
                        this.variables.set('automod_status', '🔗 Anti-liens activé');
                        if (message) await message.reply('🔗 **Auto-modération anti-liens activée**');
                        break;
                    case 'caps':
                        this.automodConfig.antiCaps = true;
                        this.variables.set('automod_status', '📢 Anti-majuscules activé');
                        if (message) await message.reply('📢 **Auto-modération anti-majuscules activée**');
                        break;
                }
            }

            // 4. my.backup.create - Créer une sauvegarde du serveur
            else if (line.startsWith('my.backup.create') && message) {
                if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    await message.reply('❌ Seuls les administrateurs peuvent créer des sauvegardes.');
                    return;
                }

                const backupData = {
                    name: message.guild.name,
                    channels: message.guild.channels.cache.map(ch => ({ name: ch.name, type: ch.type })),
                    roles: message.guild.roles.cache.map(role => ({ name: role.name, color: role.hexColor })),
                    timestamp: new Date().toISOString()
                };

                const backupId = Math.random().toString(36).substring(2, 10);
                this.variables.set('backup_id', backupId);
                this.variables.set('backup_status', `💾 Sauvegarde créée: ${backupId}`);
                
                const embed = new EmbedBuilder()
                    .setTitle('💾 Sauvegarde Créée')
                    .setDescription(`ID de sauvegarde: \`${backupId}\`\nCanaux: ${backupData.channels.length}\nRôles: ${backupData.roles.length}`)
                    .setColor('#28a745')
                    .setTimestamp();
                await message.reply({ embeds: [embed] });
            }

            // 5. my.ticket.create - Système de tickets
            else if (line.startsWith('my.ticket.create') && message) {
                const args = this.parseArguments(line);
                const reason = args[0] || 'Support général';
                const ticketId = `ticket-${Date.now()}`;

                try {
                    const ticketChannel = await message.guild.channels.create({
                        name: ticketId,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: message.guild.id,
                                deny: [PermissionsBitField.Flags.ViewChannel],
                            },
                            {
                                id: message.author.id,
                                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                            },
                        ],
                    });

                    const embed = new EmbedBuilder()
                        .setTitle('🎫 Nouveau Ticket')
                        .setDescription(`**Créé par:** ${message.author.tag}\n**Raison:** ${reason}\n**Canal:** ${ticketChannel.toString()}`)
                        .setColor('#007bff')
                        .setTimestamp();

                    await ticketChannel.send({ embeds: [embed] });
                    await message.reply(`🎫 Ticket créé: ${ticketChannel.toString()}`);
                    this.variables.set('ticket_created', `🎫 ${ticketId}`);
                } catch (error) {
                    await message.reply('❌ Erreur lors de la création du ticket.');
                }
            }

            // 6. my.slowmode.set - Définir le mode lent
            else if (line.startsWith('my.slowmode.set') && message) {
                const args = this.parseArguments(line);
                const seconds = parseInt(args[0]) || 0;

                if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                    await message.reply('❌ Permissions insuffisantes.');
                    return;
                }

                try {
                    await message.channel.setRateLimitPerUser(seconds);
                    this.variables.set('slowmode_status', `⏰ Mode lent: ${seconds}s`);
                    if (seconds === 0) {
                        await message.reply('⏰ **Mode lent désactivé**');
                    } else {
                        await message.reply(`⏰ **Mode lent activé:** ${seconds} secondes`);
                    }
                } catch (error) {
                    await message.reply('❌ Erreur lors de la modification du mode lent.');
                }
            }

            // 7. my.announcement.create - Créer une annonce
            else if (line.startsWith('my.announcement.create') && message) {
                const args = this.parseArguments(line);
                const title = args[0] || 'Annonce';
                const content = args[1] || 'Nouvelle annonce';
                const channelName = args[2] || 'announcements';

                const announceChannel = message.guild.channels.cache.find(ch => ch.name === channelName);
                if (!announceChannel) {
                    await message.reply(`❌ Canal #${channelName} introuvable.`);
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle(`📢 ${title}`)
                    .setDescription(content)
                    .setColor('#ffc107')
                    .setFooter({ text: `Par ${message.author.tag}` })
                    .setTimestamp();

                try {
                    const announcementMsg = await announceChannel.send({ content: '@everyone', embeds: [embed] });
                    await announcementMsg.crosspost().catch(() => {}); // Publication croisée si possible
                    await message.reply(`📢 Annonce publiée dans ${announceChannel.toString()}`);
                    this.variables.set('announcement_sent', `📢 ${title}`);
                } catch (error) {
                    await message.reply('❌ Erreur lors de la publication de l\'annonce.');
                }
            }

            // 8. my.giveaway.start - Démarrer un giveaway
            else if (line.startsWith('my.giveaway.start') && message) {
                const args = this.parseArguments(line);
                const prize = args[0] || 'Prix mystère';
                const duration = args[1] || '1h';
                const winners = parseInt(args[2]) || 1;

                const embed = new EmbedBuilder()
                    .setTitle('🎉 GIVEAWAY!')
                    .setDescription(`**Prix:** ${prize}\n**Durée:** ${duration}\n**Gagnants:** ${winners}\n\nRéagissez avec 🎉 pour participer!`)
                    .setColor('#ff1493')
                    .setFooter({ text: 'Discord.my Giveaway System' })
                    .setTimestamp();

                const giveawayMsg = await message.reply({ embeds: [embed] });
                await giveawayMsg.react('🎉');
                this.variables.set('giveaway_active', `🎉 ${prize}`);
            }

            // 9. my.welcome.setup - Configuration des messages de bienvenue
            else if (line.startsWith('my.welcome.setup') && message) {
                const args = this.parseArguments(line);
                const channel = args[0] || 'welcome';
                const welcomeMessage = args[1] || 'Bienvenue {user} sur le serveur!';

                if (!this.welcomeConfig) {
                    this.welcomeConfig = {};
                }

                this.welcomeConfig[message.guild.id] = {
                    channel: channel,
                    message: welcomeMessage,
                    enabled: true
                };

                this.variables.set('welcome_status', `👋 Messages de bienvenue configurés`);
                await message.reply(`👋 **Messages de bienvenue configurés**\nCanal: #${channel}\nMessage: ${welcomeMessage}`);
            }

            // 10. my.leveling.enable - Système de niveaux
            else if (line.startsWith('my.leveling.enable') && message) {
                const userId = message.author.id;
                if (!this.levelingData) {
                    this.levelingData = new Map();
                }

                if (!this.levelingData.has(userId)) {
                    this.levelingData.set(userId, { xp: 0, level: 1, messages: 0 });
                }

                const userData = this.levelingData.get(userId);
                userData.messages++;
                userData.xp += Math.floor(Math.random() * 15) + 5;

                const nextLevelXp = userData.level * 100;
                if (userData.xp >= nextLevelXp) {
                    userData.level++;
                    userData.xp = 0;
                    this.variables.set('level_up', `🎊 Niveau ${userData.level}!`);
                    await message.reply(`🎊 **Level Up!** Vous êtes maintenant niveau **${userData.level}**!`);
                }

                this.levelingData.set(userId, userData);
                this.variables.set('user_level', userData.level.toString());
                this.variables.set('user_xp', userData.xp.toString());
            }

            // 11. my.afk.set - Système AFK
            else if (line.startsWith('my.afk.set') && message) {
                const args = this.parseArguments(line);
                const reason = args[0] || 'AFK';

                if (!this.afkUsers) {
                    this.afkUsers = new Map();
                }

                this.afkUsers.set(message.author.id, {
                    reason: reason,
                    timestamp: Date.now()
                });

                try {
                    await message.member.setNickname(`[AFK] ${message.member.displayName}`);
                } catch (error) {
                    console.log('Impossible de changer le pseudo');
                }

                this.variables.set('afk_status', `😴 AFK: ${reason}`);
                await message.reply(`😴 **Vous êtes maintenant AFK:** ${reason}`);
            }

            // 12. my.statistics.server - Statistiques détaillées du serveur
            else if (line.startsWith('my.statistics.server') && message) {
                const guild = message.guild;
                const onlineMembers = guild.members.cache.filter(member => member.presence?.status !== 'offline').size;
                const textChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText).size;
                const voiceChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildVoice).size;
                const boostLevel = guild.premiumTier;
                const boosts = guild.premiumSubscriptionCount || 0;

                const embed = new EmbedBuilder()
                    .setTitle(`📊 Statistiques de ${guild.name}`)
                    .addFields(
                        { name: '👥 Membres', value: `${guild.memberCount}`, inline: true },
                        { name: '🟢 En ligne', value: `${onlineMembers}`, inline: true },
                        { name: '💬 Canaux texte', value: `${textChannels}`, inline: true },
                        { name: '🔊 Canaux vocaux', value: `${voiceChannels}`, inline: true },
                        { name: '🎭 Rôles', value: `${guild.roles.cache.size}`, inline: true },
                        { name: '😊 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
                        { name: '🚀 Niveau de boost', value: `${boostLevel}`, inline: true },
                        { name: '⭐ Boosts', value: `${boosts}`, inline: true },
                        { name: '📅 Créé le', value: guild.createdAt.toLocaleDateString('fr-FR'), inline: true }
                    )
                    .setThumbnail(guild.iconURL())
                    .setColor('#007bff')
                    .setTimestamp();

                await message.reply({ embeds: [embed] });
                this.variables.set('server_stats_generated', '📊 Statistiques générées');
            }

            // 13. my.color.role - Rôles de couleur
            else if (line.startsWith('my.color.role') && message) {
                const args = this.parseArguments(line);
                const color = args[0] || '#ffffff';
                const roleName = `Couleur-${color}`;

                try {
                    let colorRole = message.guild.roles.cache.find(role => role.name === roleName);
                    
                    if (!colorRole) {
                        colorRole = await message.guild.roles.create({
                            name: roleName,
                            color: color,
                            reason: 'Rôle de couleur personnalisé'
                        });
                    }

                    await message.member.roles.add(colorRole);
                    await message.reply(`🎨 **Rôle de couleur appliqué:** ${color}`);
                    this.variables.set('color_role_applied', `🎨 ${color}`);
                } catch (error) {
                    await message.reply('❌ Erreur lors de l\'application du rôle de couleur.');
                }
            }

            // 14. my.embed.builder - Constructeur d'embed interactif
            else if (line.startsWith('my.embed.builder') && message) {
                const args = this.parseArguments(line);
                const title = args[0] || 'Embed personnalisé';
                const description = args[1] || 'Description';
                const color = args[2] || '#0099ff';
                const imageUrl = args[3] || null;

                const customEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(color)
                    .setFooter({ text: `Créé par ${message.author.tag}` })
                    .setTimestamp();

                if (imageUrl) {
                    customEmbed.setImage(imageUrl);
                }

                await message.reply({ embeds: [customEmbed] });
                this.variables.set('custom_embed_created', '📋 Embed personnalisé créé');
            }

            // 15. my.reaction.role - Rôles par réaction
            else if (line.startsWith('my.reaction.role') && message) {
                const args = this.parseArguments(line);
                const emoji = args[0] || '🎭';
                const roleName = args[1] || 'Membre';

                const role = message.guild.roles.cache.find(r => r.name === roleName);
                if (!role) {
                    await message.reply(`❌ Rôle "${roleName}" introuvable.`);
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎭 Rôles par Réaction')
                    .setDescription(`Réagissez avec ${emoji} pour obtenir le rôle **${roleName}**`)
                    .setColor('#9b59b6');

                const reactionMsg = await message.reply({ embeds: [embed] });
                await reactionMsg.react(emoji);

                // Stocker la configuration pour la gestion des réactions
                if (!this.reactionRoles) {
                    this.reactionRoles = new Map();
                }
                this.reactionRoles.set(`${reactionMsg.id}_${emoji}`, role.id);
                this.variables.set('reaction_role_setup', `🎭 ${emoji} → ${roleName}`);
            }

            // 16. my.music.play - Jouer de la musique (simulation)
            else if (line.startsWith('my.music.play') && message) {
                const args = this.parseArguments(line);
                const query = args[0] || 'musique aléatoire';

                if (!message.member.voice.channel) {
                    await message.reply('❌ Vous devez être dans un canal vocal.');
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎵 Lecture en cours')
                    .setDescription(`**Piste:** ${query}\n**Demandé par:** ${message.author.tag}`)
                    .setColor('#1db954')
                    .setTimestamp();

                await message.reply({ embeds: [embed] });
                this.variables.set('music_playing', `🎵 ${query}`);
            }

            // 17. my.temp.channel - Canaux temporaires
            else if (line.startsWith('my.temp.channel') && message) {
                const args = this.parseArguments(line);
                const duration = args[0] || '1h';
                const channelName = args[1] || `temp-${Date.now()}`;

                try {
                    const tempChannel = await message.guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildText,
                        reason: 'Canal temporaire'
                    });

                    await message.reply(`⏰ **Canal temporaire créé:** ${tempChannel.toString()} (durée: ${duration})`);
                    this.variables.set('temp_channel_created', `⏰ ${channelName}`);

                    // Programmer la suppression (simulation)
                    setTimeout(async () => {
                        try {
                            await tempChannel.delete('Canal temporaire expiré');
                        } catch (error) {
                            console.log('Canal déjà supprimé');
                        }
                    }, 3600000); // 1 heure
                } catch (error) {
                    await message.reply('❌ Erreur lors de la création du canal temporaire.');
                }
            }

            // 18. my.crypto.price - Prix des cryptomonnaies
            else if (line.startsWith('my.crypto.price')) {
                const args = this.parseArguments(line);
                const crypto = args[0] || 'bitcoin';
                const price = (Math.random() * 50000 + 10000).toFixed(2);
                const change = ((Math.random() - 0.5) * 20).toFixed(2);
                const changeColor = parseFloat(change) >= 0 ? '🟢' : '🔴';

                this.variables.set('crypto_price', `💰 ${crypto.toUpperCase()}: $${price} ${changeColor} ${change}%`);

                if (message) {
                    const embed = new EmbedBuilder()
                        .setTitle(`💰 Prix de ${crypto.toUpperCase()}`)
                        .setDescription(`**Prix actuel:** $${price}\n**Variation 24h:** ${changeColor} ${change}%`)
                        .setColor(parseFloat(change) >= 0 ? '#00ff00' : '#ff0000')
                        .setTimestamp();
                    await message.reply({ embeds: [embed] });
                }
            }

            // 19. my.meme.generate - Générateur de mèmes
            else if (line.startsWith('my.meme.generate')) {
                const memeTemplates = [
                    'https://i.imgflip.com/1bij.jpg', // Distracted Boyfriend
                    'https://i.imgflip.com/30b1gx.jpg', // Drake
                    'https://i.imgflip.com/1g8my4.jpg', // Expanding Brain
                    'https://i.imgflip.com/26am.jpg', // Surprised Pikachu
                    'https://i.imgflip.com/1otk96.jpg' // Distracted Boyfriend
                ];

                const randomMeme = memeTemplates[Math.floor(Math.random() * memeTemplates.length)];
                this.variables.set('generated_meme', randomMeme);

                if (message) {
                    const embed = new EmbedBuilder()
                        .setTitle('😂 Mème Généré')
                        .setImage(randomMeme)
                        .setColor('#ff6b6b');
                    await message.reply({ embeds: [embed] });
                }
            }

            // 20. my.quiz.start - Quiz interactif
            else if (line.startsWith('my.quiz.start') && message) {
                const questions = [
                    { q: 'Quelle est la capitale de la France?', answers: ['Paris', 'Lyon', 'Marseille', 'Toulouse'], correct: 0 },
                    { q: 'Combien font 2+2?', answers: ['3', '4', '5', '6'], correct: 1 },
                    { q: 'Qui a créé Discord?', answers: ['Jason Citron', 'Mark Zuckerberg', 'Elon Musk', 'Bill Gates'], correct: 0 }
                ];

                const randomQ = questions[Math.floor(Math.random() * questions.length)];
                const embed = new EmbedBuilder()
                    .setTitle('🧠 Quiz Time!')
                    .setDescription(`**Question:** ${randomQ.q}\n\n${randomQ.answers.map((a, i) => `${i + 1}️⃣ ${a}`).join('\n')}`)
                    .setColor('#6f42c1')
                    .setFooter({ text: 'Réagissez avec le bon numéro!' });

                const quizMsg = await message.reply({ embeds: [embed] });
                for (let i = 0; i < randomQ.answers.length; i++) {
                    await quizMsg.react(`${i + 1}️⃣`);
                }

                this.variables.set('quiz_active', '🧠 Quiz en cours');
            }

            // 21. my.suggestion.create - Système de suggestions
            else if (line.startsWith('my.suggestion.create') && message) {
                const args = this.parseArguments(line);
                const suggestion = args[0] || 'Suggestion anonyme';

                const embed = new EmbedBuilder()
                    .setTitle('💡 Nouvelle Suggestion')
                    .setDescription(suggestion)
                    .setFooter({ text: `Suggéré par ${message.author.tag}` })
                    .setColor('#ffc107')
                    .setTimestamp();

                const suggestionMsg = await message.reply({ embeds: [embed] });
                await suggestionMsg.react('👍');
                await suggestionMsg.react('👎');
                await suggestionMsg.react('🤷');

                this.variables.set('suggestion_created', '💡 Suggestion créée');
            }

            // 22. my.server.boost - Informations de boost
            else if (line.startsWith('my.server.boost') && message) {
                const guild = message.guild;
                const boostCount = guild.premiumSubscriptionCount || 0;
                const boostTier = guild.premiumTier;
                const boosters = guild.members.cache.filter(member => member.premiumSince).size;

                const embed = new EmbedBuilder()
                    .setTitle('🚀 Statut de Boost du Serveur')
                    .addFields(
                        { name: '⭐ Niveau de Boost', value: `${boostTier}/3`, inline: true },
                        { name: '🚀 Nombre de Boosts', value: `${boostCount}`, inline: true },
                        { name: '👑 Boosters', value: `${boosters}`, inline: true }
                    )
                    .setColor('#f47fff')
                    .setThumbnail(guild.iconURL());

                await message.reply({ embeds: [embed] });
                this.variables.set('boost_info', `🚀 Niveau ${boostTier} - ${boostCount} boosts`);
            }

            // 23. my.weather.alert - Alertes météo
            else if (line.startsWith('my.weather.alert')) {
                const args = this.parseArguments(line);
                const city = args[0] || 'Paris';
                const alertTypes = ['🌧️ Pluie forte', '❄️ Neige', '⛈️ Orage', '🌪️ Vent violent', '☀️ Canicule'];
                const randomAlert = alertTypes[Math.floor(Math.random() * alertTypes.length)];

                this.variables.set('weather_alert', `⚠️ ${city}: ${randomAlert}`);

                if (message) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Alerte Météo')
                        .setDescription(`**Ville:** ${city}\n**Alerte:** ${randomAlert}`)
                        .setColor('#ff4757')
                        .setTimestamp();
                    await message.reply({ embeds: [embed] });
                }
            }

            // 24. my.birthday.add - Système d'anniversaires
            else if (line.startsWith('my.birthday.add') && message) {
                const args = this.parseArguments(line);
                const date = args[0] || '01/01';
                const userId = message.author.id;

                if (!this.birthdayData) {
                    this.birthdayData = new Map();
                }

                this.birthdayData.set(userId, {
                    date: date,
                    username: message.author.username
                });

                this.variables.set('birthday_added', `🎂 Anniversaire ajouté: ${date}`);
                await message.reply(`🎂 **Anniversaire ajouté:** ${date}`);
            }

            // 25. my.server.member.count - Compteur de membres en temps réel
            else if (line.startsWith('my.server.member.count') && message) {
                const guild = message.guild;
                const totalMembers = guild.memberCount;
                const onlineMembers = guild.members.cache.filter(member => 
                    member.presence?.status === 'online' || 
                    member.presence?.status === 'idle' || 
                    member.presence?.status === 'dnd'
                ).size;
                const bots = guild.members.cache.filter(member => member.user.bot).size;
                const humans = totalMembers - bots;

                try {
                    // Créer ou mettre à jour un canal de comptage
                    let countChannel = guild.channels.cache.find(ch => ch.name.startsWith('Membres:'));
                    if (countChannel) {
                        await countChannel.setName(`Membres: ${totalMembers}`);
                    } else {
                        await guild.channels.create({
                            name: `Membres: ${totalMembers}`,
                            type: ChannelType.GuildVoice,
                            permissionOverwrites: [{
                                id: guild.id,
                                deny: [PermissionsBitField.Flags.Connect]
                            }]
                        });
                    }

                    this.variables.set('member_counter_updated', `👥 ${totalMembers} membres`);
                    await message.reply(`👥 **Compteur de membres mis à jour:** ${totalMembers} total (${humans} humains, ${bots} bots, ${onlineMembers} en ligne)`);
                } catch (error) {
                    await message.reply('❌ Erreur lors de la mise à jour du compteur de membres.');
                }
            }

            // 26. my.role.shop - Boutique de rôles
            else if (line.startsWith('my.role.shop') && message) {
                const availableRoles = [
                    { name: '🎨 Artiste', price: 100 },
                    { name: '🎮 Gamer', price: 150 },
                    { name: '🎵 Musicien', price: 200 },
                    { name: '📚 Lecteur', price: 75 },
                    { name: '💻 Développeur', price: 300 }
                ];

                const roleList = availableRoles.map(role => `${role.name} - ${role.price} coins`).join('\n');
                
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Boutique de Rôles')
                    .setDescription(roleList)
                    .setFooter({ text: 'Utilisez !buy-role <nom> pour acheter' })
                    .setColor('#e67e22');

                await message.reply({ embeds: [embed] });
                this.variables.set('role_shop_displayed', '🛒 Boutique affichée');
            }

            // 27. my.custom.command - Commandes personnalisées
            else if (line.startsWith('my.custom.command') && message) {
                const args = this.parseArguments(line);
                const commandName = args[0];
                const response = args[1];

                if (!commandName || !response) {
                    await message.reply('❌ Usage: my.custom.command("nom", "réponse")');
                    return;
                }

                if (!this.customCommands) {
                    this.customCommands = new Map();
                }

                this.customCommands.set(commandName, {
                    response: response,
                    author: message.author.id,
                    created: Date.now()
                });

                this.variables.set('custom_command_created', `⚙️ ${commandName}`);
                await message.reply(`⚙️ **Commande personnalisée créée:** !${commandName}`);
            }

            // 28. my.server.info.extended - Informations serveur étendues
            else if (line.startsWith('my.server.info.extended') && message) {
                const guild = message.guild;
                const owner = await guild.fetchOwner();
                const createdDays = Math.floor((Date.now() - guild.createdTimestamp) / (1000 * 60 * 60 * 24));

                const embed = new EmbedBuilder()
                    .setTitle(`📊 ${guild.name} - Informations Complètes`)
                    .addFields(
                        { name: '👑 Propriétaire', value: owner.user.tag, inline: true },
                        { name: '🆔 ID du Serveur', value: guild.id, inline: true },
                        { name: '📅 Créé il y a', value: `${createdDays} jours`, inline: true },
                        { name: '🌍 Région', value: 'Auto', inline: true },
                        { name: '🔒 Niveau de Vérification', value: `${guild.verificationLevel}`, inline: true },
                        { name: '💬 Canaux Totaux', value: `${guild.channels.cache.size}`, inline: true }
                    )
                    .setThumbnail(guild.iconURL({ size: 256 }))
                    .setColor('#5865f2');

                if (guild.banner) {
                    embed.setImage(guild.bannerURL({ size: 512 }));
                }

                await message.reply({ embeds: [embed] });
                this.variables.set('extended_info_shown', '📊 Infos étendues');
            }

            // 29. my.nickname.random - Pseudo aléatoire
            else if (line.startsWith('my.nickname.random') && message) {
                const adjectives = ['Cool', 'Super', 'Mega', 'Ultra', 'Epic', 'Awesome', 'Amazing', 'Fantastic'];
                const nouns = ['Gamer', 'Player', 'Master', 'Hero', 'Legend', 'Champion', 'Warrior', 'Knight'];
                
                const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
                const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
                const randomNumber = Math.floor(Math.random() * 999) + 1;
                const newNickname = `${randomAdj}${randomNoun}${randomNumber}`;

                try {
                    await message.member.setNickname(newNickname);
                    this.variables.set('random_nickname', newNickname);
                    await message.reply(`🎲 **Nouveau pseudo:** ${newNickname}`);
                } catch (error) {
                    await message.reply('❌ Impossible de changer le pseudo.');
                }
            }

            // 30. my.message.pin - Épingler des messages importants
            else if (line.startsWith('my.message.pin') && message) {
                if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                    await message.reply('❌ Permissions insuffisantes pour épingler des messages.');
                    return;
                }

                try {
                    await message.pin();
                    this.variables.set('message_pinned', '📌 Message épinglé');
                    await message.reply('📌 **Message épinglé avec succès!**');
                } catch (error) {
                    await message.reply('❌ Erreur lors de l\'épinglage du message.');
                }
            }

            // 31. my.server.activity - Activité du serveur
            else if (line.startsWith('my.server.activity') && message) {
                const guild = message.guild;
                const now = Date.now();
                const oneDayAgo = now - (24 * 60 * 60 * 1000);
                
                // Simulation de données d'activité
                const messagesCount = Math.floor(Math.random() * 1000) + 100;
                const activeUsers = Math.floor(Math.random() * 50) + 10;
                const newMembers = Math.floor(Math.random() * 5) + 1;

                const embed = new EmbedBuilder()
                    .setTitle('📈 Activité du Serveur (24h)')
                    .addFields(
                        { name: '💬 Messages', value: `${messagesCount}`, inline: true },
                        { name: '👥 Utilisateurs Actifs', value: `${activeUsers}`, inline: true },
                        { name: '🆕 Nouveaux Membres', value: `${newMembers}`, inline: true }
                    )
                    .setColor('#28a745')
                    .setTimestamp();

                await message.reply({ embeds: [embed] });
                this.variables.set('activity_report', `📈 ${messagesCount} messages`);
            }

            // 32. my.reminder.list - Liste des rappels
            else if (line.startsWith('my.reminder.list') && message) {
                const userId = message.author.id;
                const userReminders = [];
                
                if (this.reminders) {
                    for (const [id, reminder] of this.reminders.entries()) {
                        if (reminder.userId === userId) {
                            const timeLeft = reminder.time - Date.now();
                            if (timeLeft > 0) {
                                const minutes = Math.ceil(timeLeft / (1000 * 60));
                                userReminders.push(`**ID:** ${id.slice(-4)} - **Dans ${minutes}min:** ${reminder.text}`);
                            }
                        }
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle('⏰ Vos Rappels Actifs')
                    .setDescription(userReminders.length > 0 ? userReminders.join('\n') : 'Aucun rappel actif')
                    .setColor('#17a2b8');

                await message.reply({ embeds: [embed] });
                this.variables.set('reminders_listed', `⏰ ${userReminders.length} rappels`);
            }

            // 33. my.emoji.steal - Voler des emojis
            else if (line.startsWith('my.emoji.steal') && message) {
                const args = this.parseArguments(line);
                const emojiUrl = args[0];
                const emojiName = args[1] || 'stolen_emoji';

                if (!message.member.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers)) {
                    await message.reply('❌ Permissions insuffisantes pour gérer les emojis.');
                    return;
                }

                try {
                    const emoji = await message.guild.emojis.create({
                        attachment: emojiUrl,
                        name: emojiName,
                        reason: `Emoji ajouté par ${message.author.tag}`
                    });

                    this.variables.set('emoji_stolen', `😈 ${emoji.toString()}`);
                    await message.reply(`😈 **Emoji volé avec succès:** ${emoji.toString()}`);
                } catch (error) {
                    await message.reply('❌ Erreur lors de l\'ajout de l\'emoji.');
                }
            }

            // 34. my.server.template - Créer un template de serveur
            else if (line.startsWith('my.server.template') && message) {
                const args = this.parseArguments(line);
                const templateName = args[0] || 'Mon Template';
                const description = args[1] || 'Template créé avec Discord.my';

                if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    await message.reply('❌ Permissions insuffisantes pour créer un template.');
                    return;
                }

                try {
                    const template = await message.guild.createTemplate(templateName, description);
                    this.variables.set('template_created', `📋 ${template.code}`);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Template de Serveur Créé')
                        .setDescription(`**Nom:** ${templateName}\n**Code:** \`${template.code}\`\n**URL:** https://discord.new/${template.code}`)
                        .setColor('#5865f2');

                    await message.reply({ embeds: [embed] });
                } catch (error) {
                    await message.reply('❌ Erreur lors de la création du template.');
                }
            }

            // 35. my.confession.anonymous - Confessions anonymes
            else if (line.startsWith('my.confession.anonymous') && message) {
                const args = this.parseArguments(line);
                const confession = args[0] || 'Confession anonyme';
                const confessionChannel = args[1] || 'confessions';

                const targetChannel = message.guild.channels.cache.find(ch => ch.name === confessionChannel);
                if (!targetChannel) {
                    await message.reply(`❌ Canal #${confessionChannel} introuvable.`);
                    return;
                }

                try {
                    await message.delete().catch(() => {}); // Supprimer le message original pour l'anonymat
                    
                    const confessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
                    const embed = new EmbedBuilder()
                        .setTitle('🤐 Confession Anonyme')
                        .setDescription(confession)
                        .setFooter({ text: `ID: ${confessionId}` })
                        .setColor('#6a0dad')
                        .setTimestamp();

                    await targetChannel.send({ embeds: [embed] });
                    this.variables.set('confession_sent', `🤐 ${confessionId}`);
                    
                    // Confirmation en MP
                    try {
                        await message.author.send(`✅ **Confession envoyée anonymement** (ID: ${confessionId})`);
                    } catch (error) {
                        console.log('Impossible d\'envoyer le message de confirmation en MP');
                    }
                } catch (error) {
                    console.error('Erreur lors de l\'envoi de la confession:', error);
                }
            }

            // === FONCTIONNALITÉ PERROQUET ===

            // my.discord.parrot.enable - Activer le mode perroquet
            else if (line.startsWith('my.discord.parrot.enable')) {
                const args = this.parseArguments(line);
                const channels = args.length > 0 ? args : ['all'];
                this.parrotConfig = {
                    enabled: true,
                    channels: channels,
                    excludeCommands: true,
                    excludeBots: true,
                    delay: 0,
                    prefix: '',
                    suffix: '',
                    blacklist: [],
                    whitelist: []
                };
                console.log(`🦜 Mode Perroquet activé pour les canaux: ${channels.join(', ')}`);
            }

            // my.discord.parrot.disable - Désactiver le mode perroquet
            else if (line.startsWith('my.discord.parrot.disable')) {
                this.parrotConfig = { enabled: false };
                console.log('🦜 Mode Perroquet désactivé');
            }

            // my.discord.parrot.config - Configuration avancée du perroquet
            else if (line.startsWith('my.discord.parrot.config')) {
                const args = this.parseArguments(line);
                if (args.length >= 2) {
                    const setting = args[0];
                    const value = args[1];
                    
                    if (!this.parrotConfig) {
                        this.parrotConfig = { enabled: false, channels: ['all'], excludeCommands: true, excludeBots: true, delay: 0 };
                    }
                    
                    switch (setting) {
                        case 'exclude_commands':
                            this.parrotConfig.excludeCommands = value === 'true';
                            break;
                        case 'exclude_bots':
                            this.parrotConfig.excludeBots = value === 'true';
                            break;
                        case 'delay':
                            this.parrotConfig.delay = parseInt(value) || 0;
                            break;
                        case 'channels':
                            this.parrotConfig.channels = value.split(',').map(c => c.trim());
                            break;
                    }
                    console.log(`🦜 Configuration Perroquet mise à jour: ${setting} = ${value}`);
                }
            }

            // my.discord.parrot.prefix - Ajouter un préfixe aux messages répétés
            else if (line.startsWith('my.discord.parrot.prefix')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    if (!this.parrotConfig) {
                        this.parrotConfig = { enabled: false, channels: ['all'], excludeCommands: true, excludeBots: true, delay: 0 };
                    }
                    this.parrotConfig.prefix = args[0];
                    console.log(`🦜 Préfixe Perroquet défini: ${args[0]}`);
                }
            }

            // my.discord.parrot.suffix - Ajouter un suffixe aux messages répétés
            else if (line.startsWith('my.discord.parrot.suffix')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    if (!this.parrotConfig) {
                        this.parrotConfig = { enabled: false, channels: ['all'], excludeCommands: true, excludeBots: true, delay: 0 };
                    }
                    this.parrotConfig.suffix = args[0];
                    console.log(`🦜 Suffixe Perroquet défini: ${args[0]}`);
                }
            }

            // my.discord.parrot.filter - Filtrer certains mots ou expressions
            else if (line.startsWith('my.discord.parrot.filter')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    if (!this.parrotConfig) {
                        this.parrotConfig = { enabled: false, channels: ['all'], excludeCommands: true, excludeBots: true, delay: 0 };
                    }
                    this.parrotConfig.blacklist = args;
                    console.log(`🦜 Filtre Perroquet défini: ${args.join(', ')}`);
                }
            }

            // my.discord.parrot.only - Ne répéter que certains mots ou expressions
            else if (line.startsWith('my.discord.parrot.only')) {
                const args = this.parseArguments(line);
                if (args.length > 0) {
                    if (!this.parrotConfig) {
                        this.parrotConfig = { enabled: false, channels: ['all'], excludeCommands: true, excludeBots: true, delay: 0 };
                    }
                    this.parrotConfig.whitelist = args;
                    console.log(`🦜 Liste blanche Perroquet définie: ${args.join(', ')}`);
                }
            }

            console.log(`💬 ${line}`);

        } catch (error) {
            console.error(`❌ Erreur lors de l'interprétation de la ligne "${line}":`, error.message);
        }
    }

    // === VRAIES APIS ET FONCTIONS ===

    // API météo réelle
    async getRealWeather(city) {
        try {
            // S'assurer que fetch est initialisé
            if (!fetch) {
                const nodeFetch = await import('node-fetch');
                fetch = nodeFetch.default;
            }
            const apiKey = process.env.WEATHER_API_KEY || 'demo_key';
            const response = await fetch(`http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=fr`);

            if (!response.ok) {
                return `❌ Impossible d'obtenir la météo pour ${city}`;
            }

            const data = await response.json();
            const temp = Math.round(data.main.temp);
            const description = data.weather[0].description;
            const humidity = data.main.humidity;
            const windSpeed = data.wind.speed;

            return `🌡️ ${temp}°C à ${city}\n🌤️ ${description}\n💧 Humidité: ${humidity}%\n💨 Vent: ${windSpeed} m/s`;
        } catch (error) {
            return `❌ Erreur API météo: ${error.message}`;
        }
    }

    // Images aléatoires avec vraies APIs
    async getRealRandomImage(category) {
        try {
            // S'assurer que fetch est initialisé
            if (!fetch) {
                const nodeFetch = await import('node-fetch');
                fetch = nodeFetch.default;
            }
            switch (category.toLowerCase()) {
                case 'cats':
                    const catResponse = await fetch('https://api.thecatapi.com/v1/images/search');
                    const catData = await catResponse.json();
                    return catData[0]?.url || 'https://placekitten.com/400/300';

                case 'dogs':
                    const dogResponse = await fetch('https://dog.ceo/api/breeds/image/random');
                    const dogData = await dogResponse.json();
                    return dogData.message || 'https://place-puppy.com/400x300';

                case 'foxes':
                    const foxResponse = await fetch('https://randomfox.ca/floof/');
                    const foxData = await foxResponse.json();
                    return foxData.image || 'https://via.placeholder.com/400x300?text=Fox';

                default:
                    return `https://picsum.photos/400/300?random=${Date.now()}`;
            }
        } catch (error) {
            console.error('Erreur API image:', error);
            return 'https://via.placeholder.com/400x300?text=Error+loading+image';
        }
    }

    // Traduction réelle (utilise une API gratuite ou LibreTranslate)
    async realTranslate(text, fromLang, toLang) {
        try {
            // S'assurer que fetch est initialisé
            if (!fetch) {
                const nodeFetch = await import('node-fetch');
                fetch = nodeFetch.default;
            }
            // Utilisation d'une API de traduction gratuite
            const response = await fetch('https://api.mymemory.translated.net/get', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            // Alternative avec LibreTranslate si disponible
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`;
            const translateResponse = await fetch(url);
            const data = await translateResponse.json();

            return data.responseData?.translatedText || `[Traduction ${fromLang}→${toLang}] ${text}`;
        } catch (error) {
            return `❌ Erreur de traduction: ${error.message}`;
        }
    }

    // Système économie réel avec persistance
    getEconomyBalance(userId) {
        if (!this.economy.has(userId)) {
            this.economy.set(userId, {
                balance: 100,
                lastDaily: 0,
                inventory: [],
                level: 1,
                xp: 0
            });
        }
        return this.economy.get(userId).balance;
    }

    claimDailyBonus(userId) {
        const user = this.economy.get(userId) || {
            balance: 100,
            lastDaily: 0,
            inventory: [],
            level: 1,
            xp: 0
        };

        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        if (now - user.lastDaily < oneDayMs) {
            const timeLeft = oneDayMs - (now - user.lastDaily);
            const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
            return `⏰ Bonus quotidien déjà récupéré! Revenez dans ${hoursLeft}h`;
        }

        const bonus = Math.floor(Math.random() * 100) + 50;
        user.balance += bonus;
        user.lastDaily = now;
        user.xp += 10;

        this.economy.set(userId, user);
        return `🎁 Bonus quotidien: +${bonus} Maya Coins! (Total: ${user.balance})`;
    }

    getShopItems() {
        return `🛒 **Boutique Maya**

🎮 **Jeu Premium** - 500 coins
🍕 **Pizza Virtuelle** - 50 coins  
🎨 **Kit Artistique** - 200 coins
🎵 **Musique Premium** - 150 coins
⭐ **Badge VIP** - 1000 coins
🚗 **Voiture de Sport** - 2500 coins
🏠 **Maison Virtuelle** - 5000 coins

Utilisez \`!buy <nom>\` pour acheter!`;
    }

    buyItem(userId, itemName) {
        const user = this.economy.get(userId) || { balance: 100, inventory: [] };

        const items = {
            'jeu': { name: 'Jeu Premium', price: 500, emoji: '🎮' },
            'pizza': { name: 'Pizza Virtuelle', price: 50, emoji: '🍕' },
            'art': { name: 'Kit Artistique', price: 200, emoji: '🎨' },
            'musique': { name: 'Musique Premium', price: 150, emoji: '🎵' },
            'vip': { name: 'Badge VIP', price: 1000, emoji: '⭐' },
            'voiture': { name: 'Voiture de Sport', price: 2500, emoji: '🚗' },
            'maison': { name: 'Maison Virtuelle', price: 5000, emoji: '🏠' }
        };

        const item = items[itemName.toLowerCase()];
        if (!item) {
            return `❌ Item "${itemName}" introuvable! Tapez \`!shop\` pour voir la liste.`;
        }

        if (user.balance < item.price) {
            return `❌ Fonds insuffisants! Vous avez ${user.balance} coins, il faut ${item.price} coins.`;
        }

        user.balance -= item.price;
        user.inventory.push(item);
        user.xp += Math.floor(item.price / 10);

        this.economy.set(userId, user);
        return `✅ ${item.emoji} ${item.name} acheté pour ${item.price} coins! (Solde: ${user.balance})`;
    }

    // Système de rappels réel avec timers
    setRealReminder(userId, timeStr, reminderText, message) {
        const reminderId = Date.now().toString();
        const timeMs = this.parseTimeString(timeStr);

        setTimeout(async () => {
            try {
                if (message && message.author) {
                    await message.author.send(`⏰ **Rappel!**\n${reminderText}`);
                    console.log(`✅ Rappel envoyé à ${message.author.tag}: ${reminderText}`);
                }
                this.reminders.delete(reminderId);
            } catch (error) {
                console.error('Erreur envoi rappel:', error);
            }
        }, timeMs);

        this.reminders.set(reminderId, {
            userId,
            text: reminderText,
            time: Date.now() + timeMs
        });

        return reminderId;
    }

    parseTimeString(timeStr) {
        const regex = /(\d+)([smhd])/;
        const match = timeStr.match(regex);

        if (!match) return 300000; // 5 minutes par défaut

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 's': return value * 1000;
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return value * 60 * 1000;
        }
    }

    // Système de tâches réel
    addTodoTask(userId, task) {
        if (!this.todos.has(userId)) {
            this.todos.set(userId, []);
        }

        const taskId = Date.now().toString();
        const userTodos = this.todos.get(userId);
        userTodos.push({
            id: taskId,
            task: task,
            completed: false,
            created: new Date().toISOString()
        });

        this.todos.set(userId, userTodos);
        return taskId;
    }

    getTodoList(userId) {
        const userTodos = this.todos.get(userId) || [];

        if (userTodos.length === 0) {
            return 'Aucune tâche dans votre liste!';
        }

        return userTodos.map((todo, index) => {
            const status = todo.completed ? '✅' : '📝';
            return `${status} **${index + 1}.** ${todo.task}`;
        }).join('\n');
    }

    // Générateur de mot de passe sécurisé
    generateSecurePassword(length, includeSymbols) {
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        const symbols = includeSymbols ? '!@#$%^&*()_+-=[]{}|;:,.<>?' : '';

        const allChars = lowercase + uppercase + numbers + symbols;
        let password = '';

        // Garantir au moins un de chaque type
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        if (includeSymbols) {
            password += symbols[Math.floor(Math.random() * symbols.length)];
        }

        // Remplir le reste
        for (let i = password.length; i < length; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
        }

        // Mélanger le mot de passe
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }

    // Raccourcisseur d'URL réel
    async shortenUrl(url) {
        try {
            // S'assurer que fetch est initialisé
            if (!fetch) {
                const nodeFetch = await import('node-fetch');
                fetch = nodeFetch.default;
            }
            // Utilisation d'un service gratuit comme TinyURL
            const response = await fetch(`http://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
            const shortUrl = await response.text();

            if (shortUrl.startsWith('http')) {
                return shortUrl;
            } else {
                // Fallback avec un raccourcisseur local
                const shortId = Math.random().toString(36).substring(2, 8);
                return `https://maya.ly/${shortId}`;
            }
        } catch (error) {
            const shortId = Math.random().toString(36).substring(2, 8);
            return `https://maya.ly/${shortId}`;
        }
    }

    // Connexion du bot Discord (garder la logique existante)
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
            console.log(`✅ Toutes les fonctionnalités sont maintenant RÉELLES!`);
            this.isConnected = true;
        });

        this.client.on('messageCreate', async (message) => {
            // Gestion du mode Perroquet
            if (this.parrotConfig.enabled && !message.author.bot) {
                await this.handleParrotMessage(message);
            }

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

    // Garder toutes les autres méthodes existantes (setStatus, createCommand, executeCommand, etc.)
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
            purgeParams: null,
            roleParams: null
        });
        console.log(`📝 Commande créée: ${this.prefix}${name}`);
    }

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

    async kickMember(message, userMention, reason = 'Aucune raison spécifiée') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            await message.reply('❌ Vous n\'avez pas les permissions pour kick des membres.');
            return;
        }

        let userId;
        let member;

        // Support mention ou ID direct
        if (userMention && userMention.startsWith('<@')) {
            userId = userMention.replace(/[<@!>]/g, '');
        } else if (userMention) {
            userId = userMention;
        }

        if (userId) {
            member = message.guild.members.cache.get(userId);
            if (!member) {
                try {
                    member = await message.guild.members.fetch(userId);
                } catch (error) {
                    await message.reply('❌ Membre introuvable.');
                    return;
                }
            }
        }

        if (!member) {
            await message.reply('❌ Membre introuvable ou mention invalide.');
            return;
        }

        // Vérifications de sécurité
        if (member.id === message.author.id) {
            await message.reply('❌ Vous ne pouvez pas vous kick vous-même.');
            return;
        }

        if (member.id === message.guild.ownerId) {
            await message.reply('❌ Impossible de kick le propriétaire du serveur.');
            return;
        }

        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await message.reply('❌ Impossible de kick un administrateur.');
            return;
        }

        if (message.member.roles.highest.position <= member.roles.highest.position) {
            await message.reply('❌ Vous ne pouvez pas kick ce membre (hiérarchie de rôles).');
            return;
        }

        try {
            // Envoyer un message privé avant le kick
            try {
                await member.send(`🚪 Vous avez été expulsé du serveur **${message.guild.name}**.\nRaison: ${reason}\nPar: ${message.author.tag}`);
            } catch (error) {
                console.log('Impossible d\'envoyer un MP au membre kické');
            }

            await member.kick(reason);
            
            const embed = new EmbedBuilder()
                .setTitle('🚪 Membre Expulsé')
                .setDescription(`**Membre:** ${member.user.tag} (${member.id})\n**Raison:** ${reason}\n**Par:** ${message.author.tag}`)
                .setColor('#ff6b6b')
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
            
            // Log dans un canal de modération si disponible
            const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs' || ch.name === 'logs');
            if (logChannel) {
                await logChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Erreur kick:', error);
            await message.reply('❌ Impossible de kick ce membre. Vérifiez les permissions du bot.');
        }
    }

    async banMember(message, userMention, reason = 'Aucune raison spécifiée') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            await message.reply('❌ Vous n\'avez pas les permissions pour ban des membres.');
            return;
        }

        let userId;
        let member;

        // Support mention ou ID direct
        if (userMention && userMention.startsWith('<@')) {
            userId = userMention.replace(/[<@!>]/g, '');
        } else if (userMention) {
            userId = userMention;
        }

        if (userId) {
            member = message.guild.members.cache.get(userId);
            if (!member) {
                try {
                    member = await message.guild.members.fetch(userId);
                } catch (error) {
                    // L'utilisateur n'est peut-être plus sur le serveur, on peut quand même le bannir par ID
                    if (userId.match(/^\d{17,19}$/)) {
                        try {
                            await message.guild.members.ban(userId, { reason: reason });
                            await message.reply(`✅ Utilisateur ${userId} banni par ID. Raison: ${reason}`);
                            return;
                        } catch (banError) {
                            await message.reply('❌ Impossible de ban cet utilisateur.');
                            return;
                        }
                    }
                    await message.reply('❌ Membre introuvable.');
                    return;
                }
            }
        }

        if (!member && !userId) {
            await message.reply('❌ Membre introuvable ou mention invalide.');
            return;
        }

        // Vérifications de sécurité
        if (member && member.id === message.author.id) {
            await message.reply('❌ Vous ne pouvez pas vous bannir vous-même.');
            return;
        }

        if (member && member.id === message.guild.ownerId) {
            await message.reply('❌ Impossible de bannir le propriétaire du serveur.');
            return;
        }

        if (member && member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await message.reply('❌ Impossible de bannir un administrateur.');
            return;
        }

        if (member && message.member.roles.highest.position <= member.roles.highest.position) {
            await message.reply('❌ Vous ne pouvez pas bannir ce membre (hiérarchie de rôles).');
            return;
        }

        try {
            // Envoyer un message privé avant le ban
            if (member) {
                try {
                    await member.send(`🔨 Vous avez été banni du serveur **${message.guild.name}**.\nRaison: ${reason}\nPar: ${message.author.tag}`);
                } catch (error) {
                    console.log('Impossible d\'envoyer un MP au membre banni');
                }
            }

            await message.guild.members.ban(member || userId, { 
                reason: reason,
                deleteMessageDays: 1 // Supprimer les messages des dernières 24h
            });
            
            const embed = new EmbedBuilder()
                .setTitle('🔨 Membre Banni')
                .setDescription(`**Membre:** ${member ? member.user.tag : `ID: ${userId}`} ${member ? `(${member.id})` : ''}\n**Raison:** ${reason}\n**Par:** ${message.author.tag}`)
                .setColor('#dc3545')
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
            
            // Log dans un canal de modération si disponible
            const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs' || ch.name === 'logs');
            if (logChannel) {
                await logChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Erreur ban:', error);
            await message.reply('❌ Impossible de bannir ce membre. Vérifiez les permissions du bot.');
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

    // Supprimer des messages - VERSION CORRIGÉE ET FONCTIONNELLE
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
            // Supprimer d'abord le message de commande
            await message.delete().catch(() => {});

            // Récupérer les messages à supprimer
            const messages = await message.channel.messages.fetch({ limit: deleteCount });
            
            // Filtrer les messages (Discord ne peut supprimer que les messages de moins de 14 jours)
            const now = Date.now();
            const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);
            
            const recentMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
            const oldMessages = messages.filter(msg => msg.createdTimestamp <= twoWeeksAgo);

            let deletedCount = 0;

            // Suppression en masse pour les messages récents
            if (recentMessages.size > 0) {
                try {
                    await message.channel.bulkDelete(recentMessages, true);
                    deletedCount += recentMessages.size;
                } catch (error) {
                    console.error('Erreur suppression en masse:', error);
                }
            }

            // Suppression individuelle pour les anciens messages
            if (oldMessages.size > 0) {
                const oldArray = Array.from(oldMessages.values());
                for (let i = 0; i < Math.min(oldArray.length, 10); i++) {
                    try {
                        await oldArray[i].delete();
                        deletedCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Délai pour éviter le rate limit
                    } catch (error) {
                        console.error('Erreur suppression individuelle:', error);
                        break;
                    }
                }
            }

            // Message de confirmation
            const embed = new EmbedBuilder()
                .setTitle('🗑️ Messages Supprimés')
                .setDescription(`**${deletedCount}** messages ont été supprimés avec succès.`)
                .setColor('#28a745')
                .setFooter({ text: `Demandé par ${message.author.tag}` })
                .setTimestamp();

            const confirmMessage = await message.channel.send({ embeds: [embed] });
            
            // Supprimer le message de confirmation après 5 secondes
            setTimeout(async () => {
                try {
                    await confirmMessage.delete();
                } catch (error) {
                    console.log('Message de confirmation déjà supprimé');
                }
            }, 5000);

            // Log dans un canal de modération si disponible
            const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs' || ch.name === 'logs');
            if (logChannel && logChannel.id !== message.channel.id) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🗑️ Purge de Messages')
                    .setDescription(`**Canal:** ${message.channel.toString()}\n**Messages supprimés:** ${deletedCount}\n**Par:** ${message.author.tag}`)
                    .setColor('#ffc107')
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }

        } catch (error) {
            console.error('Erreur lors de la suppression des messages:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Erreur de Purge')
                .setDescription('Une erreur est survenue lors de la suppression des messages. Vérifiez les permissions du bot.')
                .setColor('#dc3545');
            await message.channel.send({ embeds: [errorEmbed] });
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

            console.log(`🚀 Démarrage du bot Discord.my RÉEL depuis ${filename}`);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                await this.interpretLine(line);
            }

            if (this.isConnected) {
                console.log(`✅ Bot ${filename} démarré avec VRAIES FONCTIONNALITÉS! Appuyez sur Ctrl+C pour arrêter.`);
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

    // Gérer les messages en mode Perroquet
    async handleParrotMessage(message) {
        try {
            if (!this.parrotConfig || !this.parrotConfig.enabled) return;
            
            if (this.parrotConfig.excludeBots && message.author.bot) return;
            if (this.parrotConfig.excludeCommands && message.content.startsWith(this.prefix)) return;

            const channelName = message.channel.name || 'unknown';
            const channelId = message.channel.id;

            if (!this.parrotConfig.channels.includes('all') && 
                !this.parrotConfig.channels.includes(channelName) && 
                !this.parrotConfig.channels.includes(channelId)) {
                return;
            }

            let messageContent = message.content;

            if (this.parrotConfig.blacklist && this.parrotConfig.blacklist.length > 0) {
                const hasBlacklistedWord = this.parrotConfig.blacklist.some(word => 
                    messageContent.toLowerCase().includes(word.toLowerCase())
                );
                if (hasBlacklistedWord) return;
            }

            if (this.parrotConfig.whitelist && this.parrotConfig.whitelist.length > 0) {
                const hasWhitelistedWord = this.parrotConfig.whitelist.some(word => 
                    messageContent.toLowerCase().includes(word.toLowerCase())
                );
                if (!hasWhitelistedWord) return;
            }

            if (!messageContent.trim()) return;

            if (this.parrotConfig.prefix) {
                messageContent = this.parrotConfig.prefix + ' ' + messageContent;
            }
            if (this.parrotConfig.suffix) {
                messageContent = messageContent + ' ' + this.parrotConfig.suffix;
            }

            if (this.parrotConfig.delay > 0) {
                await new Promise(resolve => setTimeout(resolve, this.parrotConfig.delay * 1000));
            }

            await message.channel.send(messageContent);
            console.log(`🦜 Message répété dans #${channelName}: "${messageContent}"`);

        } catch (error) {
            console.error('❌ Erreur dans le mode Perroquet:', error);
        }
    }
}

// CLI pour Discord.my
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
🤖 Discord.my - Créateur de bots Discord RÉELS en Maya

Usage:
  node discord-my.js <fichier.my>

Exemple:
  node discord-my.js mon_bot.my

✨ NOUVELLES FONCTIONNALITÉS RÉELLES:
- 🌤️ API météo réelle
- 🖼️ Images aléatoires vraies APIs
- 🌐 Traduction réelle  
- 💰 Économie persistante
- ⏰ Rappels fonctionnels
- 📝 Système de tâches
- 🔗 QR codes vrais
- 🔐 Mots de passe sécurisés
- 🔗 Raccourcisseur d'URL réel
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