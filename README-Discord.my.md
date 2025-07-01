
# 🤖 Discord.my - Version Discord du langage Maya

Discord.my est une bibliothèque indépendante qui permet de créer des bots Discord en utilisant la syntaxe familière du langage de programmation Maya.

## 🚀 Installation

```bash
npm install discord.js
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

### Commandes

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

### Variables

```my
my.variable bot_name = 'Maya-Bot'
my.variable version = '1.0.0'

// Utilisation dans les commandes
my.discord.command('version', 'Bot: {bot_name} v{version}')
```

### Génération Aléatoire

```my
// Nombre aléatoire
my.random.number(1, 100)

// Dans une commande
my.discord.command('dice', 'Résultat du dé:')
my.random.number(1, 6)
```

### Modération

```my
// Kick un membre (nécessite permissions)
my.discord.command('kick', 'Membre kické!')
my.discord.kick('@user', 'raison')

// Ban un membre (nécessite permissions)
my.discord.command('ban', 'Membre banni!')
my.discord.ban('@user', 'raison')
```

### Messages d'Erreur Personnalisés

```my
my.discord.error('permission', 'Vous n\'avez pas les permissions!')
my.discord.error('user_not_found', 'Utilisateur introuvable!')
```

## 📚 Exemples Complets

### Bot Simple

```my
my.discord.connect('VOTRE_TOKEN')
my.discord.prefix('!')
my.discord.status('playing', 'Discord.my', 'online')

my.discord.command('ping', 'Pong! 🏓')
my.discord.command('hello', 'Salut!')
```

### Bot de Modération

```my
my.discord.connect('VOTRE_TOKEN')
my.discord.prefix('>')

my.discord.error('no_perm', 'Permissions insuffisantes!')

my.discord.command('kick', 'Membre expulsé!')
my.discord.kick()

my.discord.command('ban', 'Membre banni!')
my.discord.ban()
```

## 🎯 Commandes Disponibles

| Commande | Description | Exemple |
|----------|-------------|---------|
| `my.discord.connect()` | Connecter le bot | `my.discord.connect('TOKEN')` |
| `my.discord.prefix()` | Définir le préfixe | `my.discord.prefix('!')` |
| `my.discord.status()` | Définir le statut | `my.discord.status('playing', 'Maya')` |
| `my.discord.command()` | Créer une commande | `my.discord.command('hello', 'Salut!')` |
| `my.discord.embed()` | Créer un embed | `my.discord.embed('title', 'Test')` |
| `my.discord.send()` | Envoyer un message | `my.discord.send('Hello!')` |
| `my.discord.kick()` | Kick un membre | `my.discord.kick('@user', 'raison')` |
| `my.discord.ban()` | Ban un membre | `my.discord.ban('@user', 'raison')` |
| `my.discord.error()` | Message d'erreur | `my.discord.error('type', 'message')` |
| `my.random.number()` | Nombre aléatoire | `my.random.number(1, 100)` |
| `my.variable` | Créer une variable | `my.variable name = 'valeur'` |

## 🔧 Permissions Bot Discord

Votre bot Discord doit avoir ces permissions:
- `Send Messages`
- `Read Message History`
- `Use Slash Commands`
- `Kick Members` (pour la modération)
- `Ban Members` (pour la modération)
- `Manage Messages`
- `Embed Links`

## 📱 Exemples d'Usage

```bash
# Démarrer un bot simple
maya Discord.my-allume exemple_bot.my

# Démarrer un bot de modération
maya Discord.my-allume bot_moderation.my

# Afficher l'aide
maya help
```

## 🎉 Créé avec la philosophie Maya

Discord.my conserve la simplicité et la créativité du langage Maya tout en offrant une interface puissante pour créer des bots Discord professionnels.

**Bon codage avec Discord.my! 🤖💜**
