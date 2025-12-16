# Architecture des composants

## 📁 Structure

```
components/
├── ui/                    # Composants UI atomiques
│   ├── Button.tsx        # Boutons réutilisables (primary, secondary, danger, ghost)
│   ├── Badge.tsx         # Badges de statut et d'information
│   ├── Card.tsx          # Carte conteneur de base
│   ├── Input.tsx         # Champ de saisie avec label
│   ├── Textarea.tsx      # Zone de texte avec label
│   └── index.ts          # Export centralisé des composants UI
│
├── Header.tsx            # En-tête avec menu utilisateur et authentification
├── CreationCard.tsx      # Carte d'aperçu d'une création (galerie)
├── CreationModal.tsx     # Modal détaillée avec lightbox et réservation
├── ReservationCard.tsx   # Carte de réservation (utilisateur & admin)
├── Filters.tsx           # Filtres de couleur et disponibilité
├── LogoutButton.tsx      # Bouton de déconnexion
├── AuthSessionProvider.tsx # Provider NextAuth
└── index.ts              # Export centralisé de tous les composants
```

## 🎨 Composants UI de base

### Button
Bouton réutilisable avec plusieurs variantes :
- `primary` : Bouton principal (fond noir)
- `secondary` : Bouton secondaire (bordure)
- `danger` : Bouton destructif (rouge)
- `ghost` : Bouton transparent

**Tailles** : `sm`, `md`, `lg`

```tsx
import { Button } from "@/components";

<Button variant="primary" size="md" onClick={handleClick}>
  Cliquez ici
</Button>
```

### Badge
Badge de statut avec variantes :
- `default` : Gris (informations générales)
- `success` : Vert (validé)
- `warning` : Jaune (en attente)
- `danger` : Rouge (annulé)

```tsx
import { Badge } from "@/components";

<Badge variant="success">Validée</Badge>
```

### Card
Conteneur avec ombre et bordure arrondie.

```tsx
import { Card } from "@/components";

<Card>
  <h2>Titre</h2>
  <p>Contenu</p>
</Card>
```

### Input / Textarea
Champs de saisie avec label optionnel.

```tsx
import { Input, Textarea } from "@/components";

<Input label="Nom" placeholder="Votre nom" />
<Textarea label="Message" rows={4} />
```

## 🧩 Composants fonctionnels

### Header
En-tête réutilisable avec :
- Titre et sous-titre dynamiques
- Menu utilisateur avec authentification
- Badge de notifications pour admin

```tsx
import { Header } from "@/components";

<Header
  title="Les créations"
  subtitle="Artisanat fait main"
  pendingReservations={5}
/>
```

### CreationCard
Carte d'aperçu pour la galerie :
- Image avec effet hover
- Titre, prix, couleur
- Badge "Vendu" / "Réservé"
- Nombre de photos

```tsx
import { CreationCard } from "@/components";

<CreationCard
  creation={creation}
  onClick={() => openModal(creation)}
/>
```

### CreationModal
Modal complète avec :
- Lightbox avec zoom et navigation
- Support tactile (swipe, pinch-to-zoom)
- Miniatures de navigation
- Bouton de réservation

```tsx
import { CreationModal } from "@/components";

<CreationModal
  creation={selectedCreation}
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onReserve={handleReserve}
/>
```

### ReservationCard
Carte de réservation avec :
- Informations de l'article
- Statut (en attente, validée, annulée)
- Formulaire d'annulation (si applicable)
- Raison d'annulation

```tsx
import { ReservationCard } from "@/components";

<ReservationCard
  reservation={reservation}
  onCancel={handleCancel}
  onClick={() => viewDetails(reservation)}
/>
```

### Filters
Filtres pour la page d'accueil :
- Dropdown de couleurs avec checkboxes
- Toggle "Disponibles uniquement"

```tsx
import { Filters } from "@/components";

<Filters
  availableColors={colors}
  selectedColors={selected}
  onColorChange={setSelected}
  showOnlyAvailable={onlyAvailable}
  onAvailabilityChange={setOnlyAvailable}
/>
```

## 📦 Utilisation

### Import unique
```tsx
import {
  Button,
  Badge,
  Card,
  Header,
  CreationCard,
  CreationModal
} from "@/components";
```

### Import spécifique
```tsx
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/Header";
```

## 🎯 Avantages de cette architecture

1. **Réutilisabilité** : Les composants sont découplés et peuvent être utilisés partout
2. **Maintenabilité** : Modifications centralisées (un changement s'applique partout)
3. **Cohérence** : Design system unifié dans toute l'application
4. **Lisibilité** : Pages plus courtes et plus faciles à comprendre
5. **Testabilité** : Composants isolés faciles à tester
6. **Performance** : Imports optimisés et tree-shaking

## 📝 Exemple de refactorisation

### Avant (450 lignes)
```tsx
export default function Page() {
  // 450 lignes de code avec logique mélangée
  return (
    <div>
      {/* JSX complexe avec styles inline */}
    </div>
  );
}
```

### Après (100 lignes)
```tsx
import { Header, CreationCard, CreationModal } from "@/components";

export default function Page() {
  // Logique métier uniquement
  return (
    <main>
      <Header title={title} subtitle={subtitle} />
      
      {creations.map(c => (
        <CreationCard creation={c} onClick={() => open(c)} />
      ))}
      
      <CreationModal
        creation={selected}
        isOpen={showModal}
        onClose={close}
      />
    </main>
  );
}
```

## 🚀 Prochaines étapes

- Créer des composants pour les pages admin (formulaires, tableaux)
- Ajouter des animations avec Framer Motion
- Implémenter un système de thème (dark mode)
- Ajouter des tests unitaires pour chaque composant
