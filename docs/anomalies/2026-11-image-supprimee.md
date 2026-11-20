# Fiche d'anomalie — Photo d'une création supprimée de Cloudinary

| Champ | Valeur |
|---|---|
| Identifiant | ANO-2026-11-03 |
| Date de détection | 19/11/2026 |
| Détectée par | L'administratrice, dans l'admin en production (liste des créations et modale « Modifier la création ») |
| Composant | Admin des créations : suppression (`DELETE /api/creations/[id]`) et formulaire (`app/admin/creations/page.tsx`) |
| Gravité | Moyenne : photo perdue sur une création (à ré-envoyer), pas de fuite de données |
| Priorité | Haute : perte de données silencieuse, reproductible par une manipulation courante |
| Statut | Ouverte : deux chemins de suppression durcis (§ 6), cause de cette perte non identifiée (§ 5.2) |
| Branche | `fix/suppression-images` |

## 1. Symptômes

- Création « Pull sans manche » (créée le 19/11/2026 à 14:41, modifiée à 15:01) : la vignette de
  la liste affiche le texte alternatif, la modale affiche un cadre « Couverture » vide.
- L'URL de l'image répond `404` avec `x-cld-error: Resource not found - lpukitxoyxnp0rwcwcno`.
- En base, la création est cohérente : `imageUrl`, `images` et `imagePublicIds` désignent bien
  cette image. C'est le fichier qui a disparu de Cloudinary.

## 2. Périmètre

Contrôle de toutes les URL d'images de la production (lecture seule, 20/11/2026) : 212 images
répondent `200`, une seule manque, celle-ci. Ce n'est pas une suppression en masse.

## 3. Environnement

| Élément | Valeur |
|---|---|
| Environnement | Production (branche `main`) |
| Stockage des images | Cloudinary, compte partagé par la production, les previews (staging) et le développement local |
| Logs | Indisponibles : le plan Vercel Hobby ne conserve ni les logs d'exécution ni les logs de requêtes de la veille |

## 4. Reproduction

1. Admin → « Nouvelle création », ajouter une photo, remplir les champs obligatoires.
2. Double-cliquer sur « ➕ Créer » (ou valider par Entrée puis cliquer) : deux requêtes `POST`
   partent, deux créations identiques partagent la même photo.
3. Supprimer le doublon.
4. Résultat : la photo de la création restante est supprimée de Cloudinary. Attendu : la photo
   est gardée tant qu'une création l'utilise.

Reproduction automatisée de ce chemin : tests listés au § 7 (ils échouent sans le correctif).
Ce scénario n'est pas celui constaté en production (voir § 5.2).

## 5. Analyse de la cause

### 5.1 Chemins qui suppriment une image

| Chemin | Vérifie que l'image ne sert plus ? |
|---|---|
| `PATCH /api/creations/[id]` (images retirées) | Oui, via `destroyUnusedImages` après la mise à jour |
| `POST /api/admin/cloudinary-cleanup` (images abandonnées dans le formulaire) | Oui, via `destroyUnusedImages` |
| `DELETE /api/creations/[id]` | **Non** : `cloudinary.uploader.destroy` direct sur chaque image, avant même la suppression en base |

Seule la suppression peut donc effacer une image encore utilisée. Il faut pour cela que deux
créations partagent une image, ce que permet le formulaire : le bouton d'envoi n'était pas
désactivé pendant l'enregistrement, et `handleSubmit` n'avait aucun verrou.

### 5.2 Cause de cette perte : non identifiée

Éléments recueillis (lecture seule, 20/11/2026) :

- Selon l'administratrice, l'envoi de la photo depuis sa tablette « n'a jamais marché ».
  Pourtant, Cloudinary a bien reçu l'image le 19/11 à 14:53 UTC (version `v1795100021` de
  l'URL) et a renvoyé son adresse, enregistrée sur la création par la modification de 15:01.
- L'usage Cloudinary du 19/11 compte 314 ressources, contre 311 le 20/11 : trois fichiers
  envoyés le 19/11 ont été supprimés depuis, dont celui-ci. Aucune image envoyée depuis le
  16/03/2026 n'est encore sur le compte.
- Le compte n'a qu'un preset signé (`ml_default`) et aucune file de modération.
- Une fois l'image enregistrée sur la création (15:01), seuls `DELETE` et un double envoi
  (§ 5.1) peuvent l'effacer : `destroyUnusedImages` la protège sur les autres chemins. Entre
  14:53 et 15:01, l'image n'étant pas encore en base, tout nettoyage qui la cite l'efface.
- Sans logs (plan Hobby), impossible de dater la suppression ni d'en connaître l'appelant.

Le double envoi suivi de la suppression d'un doublon reste un chemin possible, mais il ne colle
pas avec le témoignage de l'administratrice. Les chemins de § 5.1 sont corrigés parce qu'ils
sont fautifs, pas parce qu'ils sont prouvés à l'origine de cette perte.

## 6. Correctif

| Fichier | Changement |
|---|---|
| `app/api/creations/[id]/route.ts` | `DELETE` supprime d'abord les réservations et la création, puis seulement ses images, par `destroyUnusedImages` (une image encore référencée est gardée). Pour les anciennes créations sans `imagePublicIds`, `destroyLegacyImages` garde les URL encore affichées par une autre création |
| `app/admin/creations/page.tsx` | Verrou d'enregistrement (`savingRef`, effectif avant le nouveau rendu) et état `saving` ; erreur réseau affichée au lieu d'une exception non gérée |
| `components/admin/CreationFormModal.tsx` | Bouton d'envoi désactivé et libellé « ⏳ Enregistrement... » pendant l'enregistrement ; la prop `uploading`, jamais lue, est remplacée par `saving` |

Donnée de production : la photo est perdue (pas de sauvegarde Cloudinary activée) ; elle doit être
ré-envoyée depuis « Modifier la création ».

## 7. Tests ajoutés

| Test | Ce qu'il prouve |
|---|---|
| `tests/unit/api/creations/id.test.ts` — « garde les images encore utilisées par une autre création » | Supprimer un doublon ne détruit que l'image qui lui est propre |
| `tests/unit/api/creations/id.test.ts` — « garde l'image d'une ancienne création si une autre création affiche encore son URL » | Même garantie pour les créations sans `imagePublicIds` |
| `tests/e2e/admin.spec.ts` — « un double clic sur « Créer » n'enregistre la création qu'une fois » | Réponse ralentie à 500 ms, double clic : un seul `POST` |

## 8. Risque restant

Le compte Cloudinary est partagé par la production, staging et le développement local, alors que
chaque environnement a sa propre base. `destroyUnusedImages` ne voit que la base de son
environnement : supprimer sur staging une création qui référence une image de production (base
copiée depuis la production, par exemple) effacerait cette image en production. Piste : un
compte ou un dossier Cloudinary par environnement (à inscrire au backlog).

## 9. Leçons retenues

- Toute suppression d'un fichier partageable passe par une seule fonction qui vérifie son usage.
- Supprimer la donnée qui référence le fichier avant le fichier, pas l'inverse.
- Un formulaire qui crée une ressource doit bloquer le double envoi.
