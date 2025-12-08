# Gestion dynamique des couleurs et types d'articles

## 🎯 Fonctionnalité

Les couleurs et types d'articles sont maintenant gérables depuis le backoffice. Fini les valeurs hardcodées !

## 📍 Accès

Pour gérer les couleurs et types :
1. Se connecter en tant qu'admin
2. Aller dans **Administration** (`/admin`)
3. Descendre jusqu'à la section **"⚙️ Paramètres de la page d'accueil"**
4. Les sections **🎨 Couleurs disponibles** et **📦 Types d'articles** sont directement accessibles

## ✨ Fonctionnalités

### Couleurs
- Ajouter de nouvelles couleurs
- Supprimer des couleurs existantes
- Les couleurs sont automatiquement disponibles dans les formulaires de création/édition d'articles

### Types d'articles
- Ajouter de nouveaux types (ex: "écharpe", "pull", "gilet")
- Supprimer des types existants
- Les types sont automatiquement disponibles dans les formulaires de création/édition d'articles

## 🔧 Initialisation

Pour initialiser les paramètres avec les valeurs par défaut, exécuter :

```bash
npm run init-settings
```

Ou avec ts-node directement :

```bash
npx ts-node scripts/init-settings.ts
```

## 📊 Structure

### Modèle Settings
```typescript
{
  _id: "main",
  title: string,
  subtitle: string,
  colors: string[],  // Nouveau
  types: string[]    // Nouveau
}
```

### Valeurs par défaut

**Couleurs :**
- Blanc, Noir, Gris, Beige, Marron
- Rouge, Rose, Rose poudré, Orange, Jaune
- Vert, Bleu, Bleu marine, Violet
- Multicolore

**Types :**
- bonnet
- tour de cou
- bandeau

## 🚀 Utilisation

Les couleurs et types sont automatiquement chargés dans :
- Page de création d'articles (`/admin/creations`)
- Page d'édition d'articles
- Filtres sur la page d'accueil

Aucune modification de code nécessaire pour ajouter/supprimer des valeurs !

## 🔄 Migration

Si vous avez déjà des articles avec des types spécifiques, assurez-vous de les ajouter dans les paramètres pour qu'ils continuent à s'afficher correctement.

L'ancien enum des types a été supprimé du modèle `Creation` pour accepter n'importe quelle valeur string.
