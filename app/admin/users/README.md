# Gestion des utilisateurs - Admin

Cette page permet aux administrateurs de gérer tous les utilisateurs de l'application.

## Fonctionnalités

### Consultation
- Liste complète de tous les utilisateurs
- Affichage des informations : nom, email, rôle, provider, date de création
- Badges visuels pour identifier les rôles (admin/user) et les providers

### Création
- Formulaire de création d'utilisateur
- Champs : nom (optionnel), email (requis), rôle, mot de passe (requis pour la création)
- Validation de l'unicité de l'email
- Hashing automatique du mot de passe avec bcryptjs

### Modification
- Édition des informations utilisateur existantes
- Modification du nom, email, rôle
- Changement de mot de passe (optionnel lors de la modification)
- Validation de l'unicité de l'email lors du changement

### Suppression
- Suppression d'un utilisateur
- Protection : impossible de supprimer son propre compte
- Confirmation avant suppression

## Sécurité

- Accès réservé aux administrateurs uniquement
- Vérification de l'authentification via `checkAdminAuth()`
- Protection contre la suppression de son propre compte
- Mots de passe hashés avec bcryptjs (10 rounds de salt)
- Pas d'exposition des tokens de réinitialisation

## Routes API

### `GET /api/admin/users`
Liste tous les utilisateurs (sans les mots de passe et tokens)

### `POST /api/admin/users`
Crée un nouvel utilisateur

**Body:**
```json
{
  "name": "Jean Dupont",
  "email": "jean@example.com",
  "role": "user",
  "password": "motdepasse123"
}
```

### `PATCH /api/admin/users/[id]`
Met à jour un utilisateur existant

**Body:**
```json
{
  "name": "Jean Dupont",
  "email": "jean@example.com",
  "role": "admin",
  "password": "nouveaumotdepasse" // optionnel
}
```

### `DELETE /api/admin/users/[id]`
Supprime un utilisateur

## Navigation

Depuis la page `/admin`, un bouton "👥 Utilisateurs" dans le header permet d'accéder à la gestion des utilisateurs.

## Design

- Interface cohérente avec le reste de l'application
- Utilisation des composants UI existants (Button, Input, Card, Badge)
- Modal pour la création/édition
- Design responsive pour mobile et desktop
