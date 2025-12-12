// Fonction pour générer une phrase personnalisée selon la couleur
export function getColorSpecificSentence(color: string): string {
  const colorLower = color.toLowerCase();
  const colorSentences: Record<string, string[]> = {
    "rose": [
      `Sa couleur rose apportera du peps et de la douceur à vos tenues d'hiver, créant une harmonie parfaite avec les tons neutres comme le beige, le gris ou le noir.`,
      `Ce rose délicat s'harmonise parfaitement avec un manteau gris ou beige, apportant une touche de féminité et d'élégance à votre look hivernal.`,
      `La teinte rose de cette création apporte une note de douceur et de modernité, parfaite pour égayer vos tenues hivernales tout en restant raffinée.`
    ],
    "bleu": [
      `Ce bleu profond s'accordera parfaitement avec un manteau gris, noir ou camel, créant un contraste élégant et moderne.`,
      `La couleur bleue de cette pièce apporte une touche de sérénité et de sophistication, idéale pour un look classique et intemporel.`,
      `Ce bleu intense se marie harmonieusement avec les tons neutres, offrant une alternative raffinée aux couleurs traditionnelles de l'hiver.`
    ],
    "rouge": [
      `Ce rouge vif apportera une touche d'audace et de chaleur à vos tenues, parfait pour se démarquer tout en restant élégant.`,
      `La couleur rouge de cette création apporte énergie et caractère, idéale pour ceux qui souhaitent ajouter une note de personnalité à leur garde-robe.`,
      `Ce rouge éclatant s'harmonise parfaitement avec les tons sombres, créant un contraste saisissant et moderne.`
    ],
    "noir": [
      `Le noir intemporel de cette pièce s'accorde avec toutes les tenues, offrant une polyvalence incomparable et une élégance absolue.`,
      `Cette couleur noire classique et sophistiquée s'intègre parfaitement à tous les styles, du casual au plus formel.`,
      `Le noir de cette création apporte une touche d'élégance intemporelle, parfait pour compléter n'importe quelle tenue avec style.`
    ],
    "blanc": [
      `Ce blanc pur apporte fraîcheur et luminosité à vos tenues hivernales, créant un contraste élégant avec les tons sombres.`,
      `La couleur blanche de cette pièce offre une alternative raffinée et moderne, parfaite pour un look épuré et sophistiqué.`,
      `Ce blanc immaculé s'harmonise parfaitement avec toutes les couleurs, apportant une touche de pureté et d'élégance à votre tenue.`
    ],
    "gris": [
      `Ce gris élégant s'accorde parfaitement avec toutes les couleurs, offrant une polyvalence exceptionnelle et un style intemporel.`,
      `La teinte grise de cette création apporte sophistication et modernité, idéale pour un look raffiné et polyvalent.`,
      `Ce gris neutre s'harmonise avec tous les styles vestimentaires, créant une base parfaite pour toutes vos tenues.`
    ],
    "beige": [
      `Ce beige doux apporte chaleur et élégance à vos tenues, s'harmonisant parfaitement avec les tons neutres et les couleurs pastel.`,
      `La couleur beige de cette pièce offre une alternative douce et raffinée, parfaite pour un look naturel et sophistiqué.`,
      `Ce beige chaleureux s'accorde harmonieusement avec toutes les couleurs, apportant une touche de douceur à votre garde-robe.`
    ]
  };
  
  // Chercher une correspondance exacte ou partielle
  for (const [key, sentences] of Object.entries(colorSentences)) {
    if (colorLower.includes(key)) {
      return sentences[Math.floor(Math.random() * sentences.length)];
    }
  }
  
  // Phrases génériques si la couleur n'est pas dans la liste
  const genericSentences = [
    `Cette couleur unique apportera une touche de personnalité à vos tenues, créant un style qui vous ressemble.`,
    `La teinte de cette création s'harmonise parfaitement avec une grande variété de tenues, offrant polyvalence et élégance.`,
    `Cette couleur soigneusement choisie complétera parfaitement votre garde-robe, ajoutant une note de style à chaque port.`
  ];
  return genericSentences[Math.floor(Math.random() * genericSentences.length)];
}

// Fonction pour générer automatiquement la description SEO
export function generateSeoDescription(form: {
  title: string;
  description?: string;
  color?: string;
  type?: string;
  price?: string;
}): string {
  const paragraphs: string[] = [];
  
  // Variantes d'introduction pour plus de diversité
  const introVariants = [
    (title: string, type: string, color: string) => {
      if (type && color) {
        return `"${title}" est un ${type} tricoté à la main dans un joli ${color}. Cette pièce unique allie savoir-faire traditionnel et esthétique moderne pour vous offrir un accessoire de qualité supérieure.`;
      } else if (type) {
        return `"${title}" est un ${type} tricoté à la main. Cette création artisanale combine élégance et fonctionnalité pour vous offrir un accessoire unique et raffiné.`;
      } else {
        return `"${title}" est une pièce unique tricotée à la main. Cette création artisanale reflète le savoir-faire traditionnel du tricot pour vous offrir un accessoire de qualité exceptionnelle.`;
      }
    },
    (title: string, type: string, color: string) => {
      if (type && color) {
        return `Découvrez "${title}", un ${type} tricoté à la main dans une belle couleur ${color}. Chaque point a été soigneusement réalisé à la main pour créer une pièce unique qui allie confort, style et qualité.`;
      } else if (type) {
        return `Découvrez "${title}", un ${type} tricoté à la main. Tricoté avec passion et attention aux détails, cet accessoire unique vous offre un mélange parfait entre esthétique et praticité.`;
      } else {
        return `Découvrez "${title}", une création unique tricotée à la main. Cette pièce artisanale témoigne d'un savoir-faire traditionnel et d'un souci du détail qui en font un accessoire d'exception.`;
      }
    },
    (title: string, type: string, color: string) => {
      if (type && color) {
        return `"${title}" vous propose un ${type} tricoté main dans un délicat ${color}. Réalisé avec des matériaux de qualité et un savoir-faire artisanal, cet accessoire unique saura compléter parfaitement votre garde-robe.`;
      } else if (type) {
        return `"${title}" vous propose un ${type} tricoté main. Chaque maillon de cette création unique a été pensé pour vous offrir confort, élégance et durabilité.`;
      } else {
        return `"${title}" est une création unique tricotée main. Cette pièce artisanale allie tradition et modernité pour vous offrir un accessoire qui se démarque par sa qualité et son originalité.`;
      }
    }
  ];
  
  // Sélectionner une variante aléatoire
  const introVariant = introVariants[Math.floor(Math.random() * introVariants.length)];
  const typeLabels: Record<string, string> = {
    "bonnet": "bonnet",
    "tour de cou": "tour de cou",
    "bandeau": "bandeau"
  };
  const typeLabel = form.type ? typeLabels[form.type] || form.type : "";
  const colorLabel = form.color ? form.color.toLowerCase() : "";
  
  if (form.title) {
    paragraphs.push(introVariant(form.title, typeLabel, colorLabel));
  }
  
  // Paragraphe personnalisé selon la couleur (pour éviter le contenu dupliqué)
  if (form.color) {
    paragraphs.push(getColorSpecificSentence(form.color));
  }
  
  // Deuxième paragraphe : Description personnalisée selon le type et les caractéristiques
  const typeSpecificTexts: Record<string, string[]> = {
    "bonnet": [
      `Confortable et chaleureux, ce bonnet vous protégera efficacement du froid tout en ajoutant une touche d'élégance à votre tenue. Sa coupe soignée et son design intemporel en font un accessoire indispensable pour affronter les températures hivernales avec style. Que vous soyez en ville ou à la campagne, ce bonnet s'adapte à toutes les situations et complète parfaitement votre look, qu'il soit décontracté ou plus formel.`,
      `Idéal pour les journées d'hiver, ce bonnet tricoté à la main offre un excellent rapport chaleur-confort. Sa texture douce et agréable au toucher, combinée à une excellente isolation thermique, vous garantit une protection optimale contre le froid. Le design soigné de ce bonnet lui permet de s'harmoniser avec une grande variété de tenues, du style casual au plus élégant, faisant de lui un accessoire polyvalent et intemporel.`,
      `Parfait pour compléter votre garde-robe hivernale, ce bonnet allie esthétique et fonctionnalité. Conçu pour résister aux intempéries tout en conservant un aspect raffiné, il vous accompagnera tout au long de la saison froide. Sa forme étudiée assure un maintien optimal tout en préservant votre confort, et sa finition soignée témoigne de la qualité artisanale de cette création unique.`
    ],
    "tour de cou": [
      `Polyvalent et pratique, ce tour de cou s'adapte à toutes les situations et s'harmonise avec n'importe quel style vestimentaire. Que vous partiez en promenade, que vous alliez au travail ou que vous pratiquiez une activité en extérieur, cet accessoire vous offrira la protection et le confort nécessaires. Sa facilité d'utilisation et sa discrétion en font un compagnon idéal pour toutes vos sorties hivernales, tout en ajoutant une note d'élégance à votre tenue.`,
      `Confortable à porter, ce tour de cou vous protégera du vent et du froid tout en restant discret et élégant. Sa texture douce et sa coupe ajustable vous garantissent un confort optimal tout au long de la journée. Légèrement extensible, il s'adapte parfaitement à votre morphologie et vous offre une protection efficace sans être encombrant. Idéal pour les personnes qui recherchent un accessoire pratique et stylé, ce tour de cou saura répondre à tous vos besoins.`,
      `Accessoire indispensable pour l'hiver, ce tour de cou combine protection et style avec brio. Sa conception soignée permet une excellente isolation thermique tout en conservant une apparence raffinée. Facile à mettre et à retirer, il s'intègre naturellement à votre routine quotidienne et devient rapidement un élément essentiel de votre garde-robe hivernale. Que vous préfériez le porter de manière classique ou de façon plus créative, ce tour de cou offre une grande liberté de style.`
    ],
    "bandeau": [
      `Élégant et pratique, ce bandeau garde vos oreilles au chaud sans déranger votre coiffure. Sa conception intelligente vous permet de profiter d'une protection efficace contre le froid tout en préservant votre style capillaire. Parfait pour les personnes qui souhaitent rester élégantes même par temps froid, ce bandeau s'adapte à tous les types de coiffures et s'intègre harmonieusement à votre look. Sa largeur optimale assure une couverture parfaite des zones sensibles tout en restant discret et raffiné.`,
      `Parfait pour les activités en extérieur, ce bandeau offre chaleur et confort sans compromettre votre style. Que vous pratiquiez le jogging, la randonnée ou simplement que vous vous promeniez, cet accessoire vous protégera efficacement tout en laissant votre tête respirer. Sa matière respirante et sa coupe ajustable en font un compagnon idéal pour tous les amateurs de sports et d'activités de plein air. Léger et peu encombrant, il se glisse facilement dans votre poche ou votre sac.`,
      `Idéal pour compléter votre look hivernal, ce bandeau s'adapte à tous les styles, du décontracté au plus sophistiqué. Sa polyvalence en fait un accessoire incontournable qui peut être porté de multiples façons selon vos envies et vos besoins. Que vous l'associez à un manteau d'hiver classique ou à une veste plus moderne, ce bandeau apportera toujours une touche d'élégance à votre tenue. Sa finition soignée et sa qualité de fabrication garantissent une durabilité exceptionnelle.`
    ]
  };
  
  if (form.type && typeSpecificTexts[form.type]) {
    const texts = typeSpecificTexts[form.type];
    paragraphs.push(texts[Math.floor(Math.random() * texts.length)]);
  } else {
    paragraphs.push(`Conçu avec soin et attention aux détails, cette pièce unique allie qualité, confort et esthétique. Chaque point a été réalisé avec précision pour vous offrir un accessoire qui se distingue par sa finition impeccable et sa durabilité. Cette création artisanale témoigne d'un savoir-faire traditionnel qui perdure et qui garantit une qualité supérieure à chaque pièce.`);
  }
  
  // Troisième paragraphe : Informations sur la fabrication et les matériaux
  const fabricationTexts = [
    `Tricoté à la main avec des matériaux de qualité, chaque pièce est unique et reflète le savoir-faire artisanal. Le processus de fabrication artisanal garantit une attention particulière à chaque détail, de la sélection des fils à la finition finale. Cette méthode traditionnelle permet de créer des accessoires qui se distinguent par leur qualité exceptionnelle et leur caractère unique. Chaque création est le fruit d'un travail méticuleux qui valorise les techniques ancestrales du tricot tout en s'adaptant aux besoins modernes.`,
    `Réalisé avec passion et expertise, ce tricot fait main garantit une qualité supérieure et une finition soignée. L'artisan qui a créé cette pièce a consacré du temps et de l'attention à chaque étape de la réalisation, depuis le choix des matériaux jusqu'aux finitions finales. Cette approche artisanale permet d'obtenir un résultat qui dépasse largement les standards de qualité des productions industrielles. Chaque point, chaque maille témoigne d'un savoir-faire qui se transmet de génération en génération.`,
    `Chaque détail a été pensé pour vous offrir un accessoire de qualité, tricoté main avec des fils sélectionnés pour leur douceur et leur résistance. La sélection rigoureuse des matériaux assure non seulement un confort optimal mais aussi une durabilité exceptionnelle. Les techniques de tricot utilisées permettent de créer une structure solide qui conserve sa forme et ses propriétés isolantes dans le temps. Cette attention portée à la qualité des matériaux et à la technique de fabrication garantit un produit qui vous accompagnera de nombreuses saisons.`,
    `Fait main en France, cette création unique met en valeur le savoir-faire traditionnel du tricot. En choisissant cette pièce, vous soutenez l'artisanat local et les techniques traditionnelles qui font la renommée du savoir-faire français. Chaque création est le reflet d'une passion pour l'artisanat et d'un engagement en faveur de la qualité et de la durabilité. Cette approche éthique et responsable s'inscrit dans une démarche de préservation des métiers d'art et de valorisation du travail manuel.`
  ];
  
  paragraphs.push(fabricationTexts[Math.floor(Math.random() * fabricationTexts.length)]);
  
  // Quatrième paragraphe : Avantages et bénéfices
  const benefitsTexts = [
    `En plus de sa qualité exceptionnelle, cet accessoire présente de nombreux avantages. Sa matière douce et soyeuse offre une excellente régulation thermique, vous gardant au chaud quand il fait froid tout en restant respirant. Le tricot fait main possède des propriétés qui le rendent résistant et facile à entretenir. De plus, chaque pièce étant unique, vous posséderez un accessoire qui vous ressemble et qui se démarque de la production de masse.`,
    `L'investissement dans un accessoire fait main comme celui-ci représente bien plus qu'un simple achat. C'est un choix en faveur de la qualité, de la durabilité et de l'artisanat local. Contrairement aux produits industriels, cette création vous garantit une qualité supérieure et une longévité exceptionnelle. Chaque pièce étant unique, vous bénéficiez d'un accessoire exclusif qui reflète votre personnalité et vos valeurs. De plus, en choisissant l'artisanat, vous contribuez à préserver des savoir-faire traditionnels précieux.`,
    `Cet accessoire se distingue par ses nombreuses qualités qui en font un choix judicieux pour votre garde-robe. Le tricot fait main offre des propriétés isolantes exceptionnelles tout en restant doux et agréable au contact de la peau. La fabrication artisanale garantit une finition soignée et une attention particulière à chaque détail. En optant pour cette création unique, vous faites le choix de la qualité, de l'authenticité et du respect de l'environnement, tout en possédant un accessoire qui vous accompagnera de nombreuses années.`
  ];
  
  paragraphs.push(benefitsTexts[Math.floor(Math.random() * benefitsTexts.length)]);
  
  // Cinquième paragraphe : Prix et appel à l'action (varié)
  const ctaVariants = [
    (price: string) => `Disponible au prix de ${price}€, cette pièce unique vous attend. N'hésitez pas à commander pour profiter d'un accessoire fait main de qualité qui vous accompagnera de nombreuses saisons. En choisissant cette création artisanale, vous investissez dans un accessoire durable, élégant et unique qui reflète votre goût pour la qualité et l'authenticité.`,
    (price: string) => `Prix : ${price}€. Commandez dès maintenant et offrez-vous un accessoire unique tricoté à la main qui allie tradition et modernité. Cette création artisanale représente un excellent rapport qualité-prix, offrant une qualité exceptionnelle à un tarif accessible. Ne manquez pas l'opportunité de posséder une pièce unique qui se démarque par son savoir-faire et son élégance.`,
    (price: string) => `À seulement ${price}€, cette création fait main est un excellent rapport qualité-prix. Passez votre commande dès aujourd'hui et découvrez la différence entre un accessoire artisanal et un produit industriel. Cette pièce unique vous offrira satisfaction et fierté à chaque port, témoignant de votre choix pour la qualité et l'authenticité.`,
    (price: string) => `Pour ${price}€, offrez-vous cette création unique qui allie savoir-faire traditionnel et esthétique moderne. Chaque pièce étant réalisée à la main, les quantités sont limitées, alors n'attendez pas pour réserver la vôtre. En commandant maintenant, vous garantissez la disponibilité de cette pièce exceptionnelle et vous vous offrez un accessoire qui vous accompagnera de nombreuses années.`
  ];
  
  if (form.price) {
    const ctaVariant = ctaVariants[Math.floor(Math.random() * ctaVariants.length)];
    paragraphs.push(ctaVariant(form.price));
  } else {
    paragraphs.push(`Disponible sur commande, cette création unique vous attend. Contactez-nous pour réserver votre pièce faite main et découvrez la qualité exceptionnelle de nos créations artisanales. Chaque commande est traitée avec soin et attention, garantissant une satisfaction optimale et un produit qui répond parfaitement à vos attentes.`);
  }
  
  return paragraphs.join("\n\n");
}

