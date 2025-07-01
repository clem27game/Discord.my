
# 🤖 Discord.my - Version Discord du langage Maya

Discord.my est une bibliothèque indépendante qui permet de créer des bots Discord en utilisant la syntaxe familière du langage de programmation Maya.

## 🚀 Installation

```bash
npm install discord.js node-fetch
chmod +x maya
```

## 📝 Utilisation

### Démarrer un bot Discord

```bash
maya Discord.my-allume mon_bot.my
```

### Structure d'un fichier .my

```my
// Connexion du bot
my.discord.connect('VOTRE_TOKEN_BOT')

// Configuration
my.discord.prefix('!')
my.discord.status('playing', 'avec Discord.my', 'online')

// Commandes
my.discord.command('salut', 'Bonjour!')
```

## 🛠️ Fonctionnalités

### Connexion et Configuration

```my
// Connecter le bot
my.discord.connect('TOKEN_BOT')

// Définir le préfixe des commandes
my.discord.prefix('!')

// Définir le statut du bot
my.discord.status('playing', 'avec Maya', 'online')
// Types: playing, listening, watching, streaming
// Statuts: online, idle, dnd, invisible
```

### Commandes Basiques

```my
// Commande simple
my.discord.command('hello', 'Bonjour le monde!')

// Commande avec embed
my.discord.command('info', 'embed')
my.discord.embed('title', 'Mon Bot', 'description', 'Créé avec Discord.my', 'color', '#00ff00')
```

### Embeds Personnalisés

```my
my.discord.embed(
    'title', 'Titre de l\'embed',
    'description', 'Description détaillée',
    'color', '#ff5500',
    'footer', 'Texte du footer',
    'image', 'https://example.com/image.png',
    'thumbnail', 'https://example.com/thumb.png'
)
```

### Variables et Substitution

```my
my.variable bot_name = 'Maya-Bot'
my.variable version = '1.0.0'
my.variable owner = 'Mon Nom'

// Utilisation dans les commandes
my.discord.command('version', 'Bot: {bot_name} v{version} par {owner}')
```

### Génération Aléatoire

```my
// Nombre aléatoire
my.random.number(1, 100)
my.discord.command('dice', 'Résultat du dé: {random}')

// Images aléatoires depuis des APIs
my.random.image('cat')  // Chat aléatoire
my.random.image('dog')  // Chien aléatoire
my.random.image('meme') // Meme aléatoire
```

### Fonctions Mathématiques

```my
// Calculatrice intégrée
my.math.add(5, 3)     // Addition
my.math.sub(10, 4)    // Soustraction  
my.math.mul(6, 7)     // Multiplication
my.math.div(20, 4)    // Division
my.math.sqrt(16)      // Racine carrée
my.math.pow(2, 3)     // Puissance

// Utilisation en commande
my.discord.command('calc', 'Résultat: {math_result}')
my.math.add(10, 5)
```

### Informations Temporelles

```my
// Date et heure actuelles
my.time.now()         // Timestamp complet
my.time.date()        // Date seulement
my.time.hour()        // Heure seulement

my.discord.command('time', 'Il est actuellement: {time_now}')
```

### Modération Avancée

```my
// Kick avec paramètres personnalisés
my.discord.command('kick', 'Membre expulsé!')
my.discord.kick('@user', 'Comportement inapproprié')

// Ban avec durée et raison
my.discord.command('ban', 'Membre banni!')
my.discord.ban('@user', 'Spam répété')

// Mute temporaire
my.discord.command('mute', 'Membre mis en sourdine!')
my.discord.mute('@user', '10m', 'Timeout')

// Purge de messages
my.discord.command('purge', 'Messages supprimés!')
my.discord.purge('10')

// Gestion des rôles
my.discord.command('role', 'Rôle attribué!')
my.discord.role('@user', 'add', 'Membre')
```

### Fonctionnalités Sociales

```my
// Messages privés
my.discord.command('dm', 'Message privé envoyé!')
my.discord.dm('@user', 'Voici ton message privé!')

// Sondages interactifs
my.discord.command('poll', 'embed')
my.discord.poll('Question du sondage?', 'Option 1', 'Option 2', 'Option 3', 'Option 4')

// Réactions automatiques
my.discord.command('react', 'Réaction ajoutée!')
my.discord.react('👍', '👎', '❤️')
```

### Informations Serveur et Utilisateur

```my
// Informations du serveur
my.discord.command('server', 'embed')
my.discord.server()

// Informations utilisateur
my.discord.command('userinfo', 'embed')
my.discord.user.info('@user')

// Avatar d'un utilisateur
my.discord.command('avatar', 'embed')
my.discord.avatar('@user')

// Statistiques du bot
my.discord.command('stats', 'embed')
my.discord.stats()
```

### Messages d'Erreur Personnalisés

```my
my.discord.error('permission', 'Vous n\'avez pas les permissions!')
my.discord.error('user_not_found', 'Utilisateur introuvable!')
my.discord.error('invalid_command', 'Commande invalide!')
my.discord.error('cooldown', 'Attendez avant de réutiliser cette commande!')
```

### Fonctionnalités Créatives

```my
// Génération de QR codes
my.discord.command('qr', 'embed')
my.qr.generate('https://discord.gg/monserveur')

// Citations inspirantes
my.discord.command('quote', 'embed')
my.random.quote()

// Horoscope du jour
my.discord.command('horoscope', 'embed')
my.horoscope('cancer')

// Blagues aléatoires
my.discord.command('joke', 'embed')
my.random.joke()

// Faits amusants
my.discord.command('fact', 'embed')
my.random.fact()
```

### Systèmes de Jeux

```my
// Économie virtuelle
my.economy.balance('@user')     // Voir le solde
my.economy.give('@user', 100)   // Donner de l'argent
my.economy.work()               // Travailler pour gagner
my.economy.daily()              // Bonus quotidien

// Mini-jeux
my.game.coinflip()              // Pile ou face
my.game.rps('pierre')           // Pierre-papier-ciseaux
my.game.8ball('Question?')      // Boule magique
my.game.trivia()                // Questions-réponses

// Système de niveaux
my.level.check('@user')         // Vérifier le niveau
my.level.leaderboard()          // Classement
```

### Utilitaires Avancés

```my
// Raccourcisseur d'URL
my.url.shorten('https://example.com/very/long/url')

// Traducteur
my.translate('Hello', 'en', 'fr')

// Météo
my.weather('Paris')

// Convertisseur de devises
my.currency('100', 'USD', 'EUR')

// Générateur de mots de passe
my.password.generate(12, 'strong')

// Base64 encoder/decoder
my.base64.encode('Hello World')
my.base64.decode('SGVsbG8gV29ybGQ=')
```

### Système d'Événements

```my
// Événements personnalisés
my.event.create('Tournoi', '2024-12-25', 'Grand tournoi de Noël!')
my.event.remind('Tournoi', '1h')

// Anniversaires
my.birthday.set('@user', '25/12')
my.birthday.list()

// Rappels personnels
my.reminder.set('@user', '30m', 'Prendre une pause!')
```

## 📚 Exemples Complets

### Bot Simple

```my
my.discord.connect('VOTRE_TOKEN')
my.discord.prefix('!')
my.discord.status('playing', 'Discord.my v2.0', 'online')

my.variable bot_name = 'Maya-Bot'

my.discord.command('ping', 'Pong! 🏓')
my.discord.command('hello', 'Salut {user}!')
my.discord.command('info', 'embed')
my.discord.embed('title', '{bot_name}', 'description', 'Bot créé avec Discord.my', 'color', '#00ff00')
```

### Bot de Modération

```my
my.discord.connect('VOTRE_TOKEN')
my.discord.prefix('>')

my.discord.error('no_perm', 'Permissions insuffisantes!')
my.discord.error('user_not_found', 'Utilisateur introuvable!')

my.discord.command('kick', 'Membre expulsé!')
my.discord.kick('@user', 'Violation des règles')

my.discord.command('ban', 'Membre banni!')
my.discord.ban('@user', 'Comportement toxique')

my.discord.command('purge', 'Messages supprimés!')
my.discord.purge('10')
```

### Bot de Divertissement

```my
my.discord.connect('VOTRE_TOKEN')  
my.discord.prefix('/')

my.discord.command('meme', 'embed')
my.random.image('meme')

my.discord.command('cat', 'embed')
my.random.image('cat')

my.discord.command('joke', 'embed')
my.random.joke()

my.discord.command('poll', 'embed')
my.discord.poll('Pizza ou Burger?', '🍕 Pizza', '🍔 Burger')

my.discord.command('flip', 'Résultat: {coinflip}')
my.game.coinflip()
```

## 🎯 Commandes Disponibles

### Commandes de Base
| Commande | Description | Exemple |
|----------|-------------|---------|
| `my.discord.connect()` | Connecter le bot | `my.discord.connect('TOKEN')` |
| `my.discord.prefix()` | Définir le préfixe | `my.discord.prefix('!')` |
| `my.discord.status()` | Définir le statut | `my.discord.status('playing', 'Maya')` |
| `my.discord.command()` | Créer une commande | `my.discord.command('hello', 'Salut!')` |
| `my.discord.embed()` | Créer un embed | `my.discord.embed('title', 'Test')` |

### Variables et Calculs
| Commande | Description | Exemple |
|----------|-------------|---------|
| `my.variable` | Créer une variable | `my.variable name = 'valeur'` |
| `my.random.number()` | Nombre aléatoire | `my.random.number(1, 100)` |
| `my.math.add()` | Addition | `my.math.add(5, 3)` |
| `my.time.now()` | Heure actuelle | `my.time.now()` |

### Modération
| Commande | Description | Exemple |
|----------|-------------|---------|
| `my.discord.kick()` | Kick un membre | `my.discord.kick('@user', 'raison')` |
| `my.discord.ban()` | Ban un membre | `my.discord.ban('@user', 'raison')` |
| `my.discord.mute()` | Mute un membre | `my.discord.mute('@user', '10m')` |
| `my.discord.purge()` | Supprimer messages | `my.discord.purge('10')` |

### Fonctionnalités Sociales
| Commande | Description | Exemple |
|----------|-------------|---------|
| `my.discord.poll()` | Créer un sondage | `my.discord.poll('Question?', 'A', 'B')` |
| `my.discord.dm()` | Message privé | `my.discord.dm('@user', 'message')` |
| `my.discord.react()` | Ajouter réactions | `my.discord.react('👍', '👎')` |

### Utilitaires et Jeux
| Commande | Description | Exemple |
|----------|-------------|---------|
| `my.random.image()` | Image aléatoire | `my.random.image('cat')` |
| `my.random.joke()` | Blague aléatoire | `my.random.joke()` |
| `my.game.coinflip()` | Pile ou face | `my.game.coinflip()` |
| `my.economy.balance()` | Solde utilisateur | `my.economy.balance('@user')` |

## 🔧 Permissions Bot Discord

Votre bot Discord doit avoir ces permissions:
- `Send Messages` ✅
- `Read Message History` ✅
- `Use Slash Commands` ✅
- `Kick Members` (pour la modération) ✅
- `Ban Members` (pour la modération) ✅
- `Manage Messages` ✅
- `Embed Links` ✅
- `Add Reactions` ✅
- `Manage Roles` (pour les rôles) ✅
- `Send Messages in Threads` ✅

## 📱 Exemples d'Usage

```bash
# Démarrer un bot simple
maya Discord.my-allume exemple_bot.my

# Démarrer un bot de modération
maya Discord.my-allume bot_moderation.my

# Démarrer un bot de divertissement
maya Discord.my-allume bot_fun.my

# Afficher l'aide
maya help
```

## 🆕 Nouvelles Fonctionnalités v2.0

### ✨ Économie Virtuelle
- Système de monnaie intégré
- Travail et gains quotidiens
- Transactions entre utilisateurs

### 🎮 Mini-Jeux Intégrés
- Pierre-papier-ciseaux
- Boule magique 8
- Questions-réponses
- Pile ou face

### 🌐 Utilitaires Web
- Raccourcisseur d'URL
- Traducteur multilingue
- Informations météo
- Convertisseur de devises

### 📅 Système d'Événements
- Création d'événements
- Rappels personnalisés
- Gestion des anniversaires

### 🔐 Sécurité Renforcée
- Gestion des cooldowns
- Vérification des permissions
- Messages d'erreur personnalisés

## 🎉 Créé avec la philosophie Maya

Discord.my conserve la simplicité et la créativité du langage Maya tout en offrant une interface puissante pour créer des bots Discord professionnels et amusants.

**Bon codage avec Discord.my! 🤖💜**

---

*Discord.my v2.0 - Plus de 50 fonctionnalités pour créer des bots Discord extraordinaires!*
