# Rémunération d'un professeur des écoles

Page statique qui montre la composition de la paie d'un professeur des écoles échelon par
échelon, puis projette l'épargne à partir d'un taux d'épargne et d'un capital de départ.

**Le site : https://ash12h.github.io/remuneration-professeur-des-ecoles/**

> Estimation à partir des textes en vigueur en septembre 2026, sans valeur officielle.
> Les montants signalés « à recouper » dans l'interface ne sont pas confirmés sur source
> primaire, les autres peuvent changer à tout moment, et seul le simulateur du ministère
> fait foi. Ce dépôt n'est ni affilié ni approuvé par l'Éducation nationale.

## Ce que fait la page

Le premier graphique décompose la paie mensuelle de chaque échelon. Les revenus s'empilent
au-dessus de zéro, traitement indiciaire, indemnités de socle, prime d'attractivité,
éducation prioritaire, missions. Les prélèvements se déduisent en dessous, retenue pension
civile, RAFP, CSG et CRDS, impôt sur le revenu, complémentaire santé. Une ligne donne le net
réellement disponible. Chaque poste porte une infobulle qui explique ce qu'il est.

Le second graphique projette le capital dans le temps à partir d'une ancienneté, d'un capital
actuel, d'un taux d'épargne et d'un taux de croissance annuel. Le calcul est mensuel, donc les
passages d'échelon s'y voient. L'aire sépare ce qui a été versé de ce que la croissance a ajouté.

Un budget mensuel complète l'ensemble, avec des catégories libres et le reste à allouer.

Rien n'est envoyé nulle part. Les réglages sont enregistrés dans le navigateur, et l'export
produit un fichier local.

## Faire tourner le site

Aucune dépendance, aucun build, aucun réseau. Ouvrir `index.html` dans un navigateur suffit,
y compris par un double clic.

| Fichier              | Rôle                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `index.html`         | structure de la page et hypothèses affichées                          |
| `css/style.css`      | mise en page et jetons de couleur, thèmes clair et sombre             |
| `js/data.js`         | toutes les données de référence, grille, primes, cotisations, barème  |
| `js/model.js`        | calcul indice vers brut vers net vers net d'impôt                     |
| `js/projection.js`   | ancienneté vers échelon, et projection du capital                     |
| `js/storage.js`      | sauvegarde navigateur, export et import                               |
| `js/chart.js`        | rendu des deux graphiques                                             |
| `js/app.js`          | contrôles, infobulles, légende, budget                                |
| `vendor/`            | Chart.js 4.4.1, copie locale, licence MIT                             |

## D'où viennent les chiffres

Les montants ont été recoupés sur sources primaires avant d'être écrits dans `js/data.js`.

| Élément                                      | Source                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| Grille indiciaire des trois grades           | décret n° 2023-721 du 4 août 2023                            |
| Cinq points d'indice majoré au 1er janv. 2024 | décret n° 2023-519 du 28 juin 2023                           |
| Prime d'attractivité par échelon             | arrêté du 12 mars 2021, modifié le 19 juillet 2023           |
| Prime d'équipement informatique              | arrêté du 5 décembre 2020                                    |
| Barème de l'impôt et décote                  | loi de finances n° 2026-103 du 19 février 2026               |
| Complémentaire santé obligatoire             | contrat collectif Éducation nationale, effet au 1er mai 2026 |

La valeur du point d'indice est gelée à 4,92278 € depuis juillet 2023.

Deux points de méthode méritent d'être signalés, parce qu'ils se retrouvent faux dans beaucoup
de calculs. L'assiette du RAFP est plafonnée à 20 % du traitement indiciaire, et aux quatre
premiers échelons les indemnités dépassent ce plafond, parce que la prime d'attractivité y est
maximale quand le traitement est minimal. Et le barème de la prime d'attractivité a changé en
septembre 2023, beaucoup de sources diffusent encore l'ancien, avec jusqu'à 100 € brut par mois
d'écart au 3e échelon.

## Ce qui périme, et quand

Deux entrées de `js/data.js` sont à revoir chaque année.

`REFERENCE.incomeTax` porte le barème de l'impôt, réindexé sur l'inflation tous les ans. Le
libellé « Barème de l'impôt 2026 » affiché en haut de page vient de là, il faut le mettre à
jour dans `index.html` en même temps.

`REFERENCE.indexPointValue` porte la valeur du point d'indice. Un dégel changerait d'un coup
toutes les valeurs de la page.

## Ajouter une prime

Ajouter une entrée dans `PAY_ITEMS` de `js/data.js`. Une prime peut faire trois choses, et le
modèle gère les trois.

- `annual` ou `annualByStep` ajoute une indemnité.
- `indexPoints` ajoute des points d'indice cotisés pour la pension, ce qui est le cas de la NBI
  d'un conseiller pédagogique et de la BI d'un directeur d'école.
- `overrides` change le montant d'une autre prime, ce qui est le cas du PEMF qui ramène l'ISAE
  de 2 550 € à 1 700 €.

Le champ `control` décide du contrôle affiché, `always` pour le socle, `choice` avec
`exclusiveGroup` pour un choix exclusif comme REP et REP+, `toggle` pour une case à cocher,
`count` pour un nombre d'unités comme les briques du Pacte. Le champ `requires` rend une case
dépendante d'une autre. Le champ `series` décide dans quelle couleur la prime est empilée.

Le champ `confidence` vaut `verified` pour un montant confirmé sur source primaire, sinon
`to-check`, ce qui affiche un badge dans l'interface. Le champ `note` est le texte de
l'infobulle, jamais affiché directement.

Toutes les primes affichées sont accessibles aux professeurs des écoles. C'est un point à
revérifier avant d'en ajouter une, parce que plusieurs indemnités de la même famille sont
réservées au second degré, l'IMP par exemple.

## Ajouter un corps

`CAREER` ne contient aujourd'hui que le professeur des écoles. Pour le second degré, le
supérieur ou l'inspection, transformer `CAREER` en liste de corps et ajouter un sélecteur. Le
reste du modèle ne dépend pas du corps, seulement de la grille et des primes éligibles. Le
corps des certifiés, PLP et CPE partage exactement la grille du professeur des écoles depuis
2023, donc il ne demandera que des primes différentes.

## Limites

Temps plein, une part fiscale, une seule personne, sans indemnité de résidence ni supplément
familial de traitement.

La projection ne suit que la classe normale. Le passage en hors classe dépend d'un tableau
d'avancement, donc le projeter reviendrait à inventer une date. Une fois le 11e échelon atteint,
la paie reste au même niveau, ce qui sous-estime une carrière réelle. Le Pacte et la part
modulable REP+ sont exclus de la projection, ils ne sont ni durables ni garantis.

Un seul taux de croissance couvre le rendement et l'inflation, à l'utilisateur de décider ce
qu'il y met, fiscalité de l'enveloppe comprise.

Les indemnités de direction d'école, de conseiller pédagogique et de PEMF sont écrites dans
`PENDING_PAY_ITEMS` mais pas affichées, faute de montants vérifiés.

## Licence

Aucune licence n'est déclarée pour l'instant, le code reste donc sous droits réservés.
Chart.js, dans `vendor/`, est distribué sous licence MIT par ses auteurs.
