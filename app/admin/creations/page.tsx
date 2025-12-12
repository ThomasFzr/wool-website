"use client";

import Link from "next/link";
import { FormEvent, useState, ChangeEvent, useEffect, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Textarea, Card, Badge } from "@/components";
import { CreationModal } from "@/components/CreationModal";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

type Creation = {
  _id: string;
  title: string;
  description?: string;
  seoDescription?: string;
  imageUrl?: string;
  images?: string[];
  imagePublicIds?: string[];
  price?: number;
  color?: string;
  type?: "bonnet" | "tour de cou" | "bandeau";
  showAsNew?: boolean;
  displayOrder?: number;
  sold?: boolean;
  slug?: string;
  createdAt?: string;
  yarnBrand?: string; // Marque de laine (admin uniquement)
  weight?: number; // Poids en grammes (admin uniquement)
  yarnPrice?: number; // Prix de la laine (admin uniquement)
};

function AdminCreationsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    title: "",
    description: "",
    seoDescription: "",
    imageUrl: "",
    images: [] as string[],
    imagePublicIds: [] as string[],
    price: "",
    color: "",
    type: "" as string,
    showAsNew: true as boolean,
    yarnBrand: "", // Marque de laine (admin uniquement)
    weight: "", // Poids en grammes (admin uniquement)
    yarnPrice: "", // Prix de la laine (admin uniquement)
  });

  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [touchStartIndex, setTouchStartIndex] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [listDragIndex, setListDragIndex] = useState<number | null>(null);
  const [listTouchStartIndex, setListTouchStartIndex] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("tous");
  const [yarnBrandFilter, setYarnBrandFilter] = useState<string>("toutes");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCreation, setSelectedCreation] = useState<Creation | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  const formRef = useRef<HTMLDivElement>(null);
  const hasLoadedCreations = useRef(false);

  // Fonction pour générer une phrase personnalisée selon la couleur
  function getColorSpecificSentence(color: string): string {
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
  function generateSeoDescription() {
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
    // On n'utilise pas form.description ici pour éviter la répétition avec la description courte
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

  function handleGenerateSeoDescription() {
    const generated = generateSeoDescription();
    setForm({ ...form, seoDescription: generated });
  }

  const colorOptions = Array.from(
    new Set(
      creations
        .map((c) => c.color?.trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => {
    if (a.toLowerCase() === "multicolore") return 1;
    if (b.toLowerCase() === "multicolore") return -1;
    return a.localeCompare(b);
  });

  const yarnBrandOptions = Array.from(
    new Set(
      creations
        .map((c) => c.yarnBrand?.trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  const filteredCreations = creations.filter((c) => {
    // Filtre par statut
    if (statusFilter === "disponible" && c.sold) return false;
    if (statusFilter === "vendu" && !c.sold) return false;
    
    // Filtre par marque de laine
    if (yarnBrandFilter !== "toutes" && c.yarnBrand !== yarnBrandFilter) return false;
    
    // Filtre par recherche
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchTitle = c.title?.toLowerCase().includes(query);
      const matchDescription = c.description?.toLowerCase().includes(query);
      const matchColor = c.color?.toLowerCase().includes(query);
      const matchType = c.type?.toLowerCase().includes(query);
      const matchPrice = c.price?.toString().includes(query);
      const matchYarnBrand = c.yarnBrand?.toLowerCase().includes(query);
      return matchTitle || matchDescription || matchColor || matchType || matchPrice || matchYarnBrand;
    }
    
    return true;
  });

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user?.role === "admin" && !hasLoadedCreations.current) {
      loadCreations();
      loadSettings();
    }
  }, [session]);

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        // Supprimer les doublons et trier
        const colors: string[] = data.colors || [];
        const types: string[] = data.types || [];
        const uniqueColors = [...new Set(colors)];
        const uniqueTypes = [...new Set(types)];
        
        // Trier les couleurs alphabétiquement (multicolore en dernier)
        const sortedColors = uniqueColors
          .filter(c => c !== "multicolore")
          .sort((a, b) => a.localeCompare(b, 'fr'))
          .concat(uniqueColors.filter(c => c === "multicolore"));
        
        // Trier les types alphabétiquement
        const sortedTypes = uniqueTypes.sort((a, b) => a.localeCompare(b, 'fr'));
        
        setAvailableColors(sortedColors);
        setAvailableTypes(sortedTypes);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  }

  // Détection du paramètre edit dans l'URL
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && creations.length > 0) {
      const creation = creations.find((c) => c._id === editId);
      if (creation) {
        handleEditClick(creation);
        // Retirer le paramètre de l'URL après chargement
        router.replace("/admin/creations", { scroll: false });
      }
    }
  }, [searchParams, creations]);

  // Désactiver le scroll quand une modale est ouverte
  useEffect(() => {
    if (showEditModal || showCreateModal) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "0px";
    }

    return () => {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "0px";
    };
  }, [showEditModal, showCreateModal]);

  async function loadCreations() {
    try {
      setLoadingList(true);
      const res = await fetch("/api/creations");
      const data = await res.json();
      setCreations(data);
      hasLoadedCreations.current = true;
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      alert("Cloudinary n'est pas configuré.");
      return;
    }

    try {
      setUploading(true);
      setMessage("Upload des images en cours...");

      const uploadedUrls: string[] = [];
      const uploadedPublicIds: string[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: "POST", body: formData }
        );

        if (!res.ok) throw new Error("Erreur Cloudinary");

        const data = await res.json();
        uploadedUrls.push(data.secure_url);
        uploadedPublicIds.push(data.public_id);
      }

      setForm((f) => ({
        ...f,
        images: [...f.images, ...uploadedUrls],
        imagePublicIds: [...f.imagePublicIds, ...uploadedPublicIds],
      }));

      setMessage("Images uploadées ✔️");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de l'upload des images.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    const payload = {
      title: form.title,
      description: form.description || undefined,
      seoDescription: form.seoDescription || undefined,
      imageUrl: form.images[0] || undefined,
      images: form.images,
      imagePublicIds: form.imagePublicIds,
      price: form.price ? Number(form.price) : undefined,
      color: form.color || undefined,
      type: form.type || undefined,
      showAsNew: form.showAsNew,
      yarnBrand: form.yarnBrand || undefined,
      weight: form.weight ? Number(form.weight) : undefined,
      yarnPrice: form.yarnPrice ? Number(form.yarnPrice) : undefined,
    };

    const url = editingId ? `/api/creations/${editingId}` : "/api/creations";
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setMessage("Erreur lors de l'enregistrement.");
      return;
    }

    setMessage(editingId ? "Création mise à jour ✔️" : "Création ajoutée ✔️");
    setTimeout(() => setMessage(null), 3000);
    
    setForm({
      title: "",
      description: "",
      seoDescription: "",
      imageUrl: "",
      images: [],
      imagePublicIds: [],
      price: "",
      color: "",
      type: "",
      showAsNew: true,
      yarnBrand: "",
      weight: "",
      yarnPrice: "",
    });
    setEditingId(null);
    setShowEditModal(false);
    setShowCreateModal(false);
    loadCreations();
  }

  function handleEditClick(c: Creation) {
    setEditingId(c._id);
    setForm({
      title: c.title ?? "",
      description: c.description ?? "",
      seoDescription: c.seoDescription ?? "",
      imageUrl: "",
      images: c.images ?? (c.imageUrl ? [c.imageUrl] : []),
      price: c.price != null ? String(c.price) : "",
      imagePublicIds: c.imagePublicIds ?? [],
      color: c.color ?? "",
      type: c.type ?? "",
      showAsNew: c.showAsNew !== undefined ? c.showAsNew : true,
      yarnBrand: c.yarnBrand ?? "",
      weight: c.weight != null ? String(c.weight) : "",
      yarnPrice: c.yarnPrice != null ? String(c.yarnPrice) : "",
    });
    setMessage(null);
    setShowEditModal(true);
  }

  async function handleDelete(id: string) {
    const ok = confirm("Supprimer cette création ?");
    if (!ok) return;

    const res = await fetch(`/api/creations/${id}`, { method: "DELETE" });

    if (!res.ok) {
      alert("Erreur lors de la suppression.");
      return;
    }

    if (editingId === id) {
      setEditingId(null);
      setForm({
        title: "",
        description: "",
        seoDescription: "",
        imageUrl: "",
        images: [],
        imagePublicIds: [],
        price: "",
        color: "",
        type: "",
        showAsNew: true,
        yarnBrand: "",
        weight: "",
        yarnPrice: "",
      });
    }

    loadCreations();
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm({
      title: "",
      description: "",
      seoDescription: "",
      imageUrl: "",
      images: [],
      imagePublicIds: [],
      price: "",
      color: "",
      type: "",
      showAsNew: true,
      yarnBrand: "",
      weight: "",
      yarnPrice: "",
    });
    setMessage(null);
    setShowEditModal(false);
    setShowCreateModal(false);
  }

  function removeImage(index: number) {
    if (!confirm('Supprimer cette image ?')) return;
    setForm((f) => ({
      ...f,
      images: f.images.filter((_, i) => i !== index),
      imagePublicIds: f.imagePublicIds.filter((_, i) => i !== index),
    }));
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    setForm((f) => {
      const imagesArr = [...f.images];
      const publicIdsArr = [...f.imagePublicIds];
      const [movedImage] = imagesArr.splice(dragIndex, 1);
      const [movedPublicId] = publicIdsArr.splice(dragIndex, 1);
      imagesArr.splice(index, 0, movedImage);
      publicIdsArr.splice(index, 0, movedPublicId);
      return { ...f, images: imagesArr, imagePublicIds: publicIdsArr };
    });

    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function handleTouchStart(index: number) {
    setTouchStartIndex(index);
    setDragIndex(index);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartIndex === null) return;
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const imageContainer = element.closest("[data-image-index]");
    if (!imageContainer) return;

    const targetIndex = Number(imageContainer.getAttribute("data-image-index"));

    if (targetIndex !== touchStartIndex && targetIndex >= 0) {
      setForm((f) => {
        const imagesArr = [...f.images];
        const publicIdsArr = [...f.imagePublicIds];
        const [movedImage] = imagesArr.splice(touchStartIndex, 1);
        const [movedPublicId] = publicIdsArr.splice(touchStartIndex, 1);
        imagesArr.splice(targetIndex, 0, movedImage);
        publicIdsArr.splice(targetIndex, 0, movedPublicId);
        return { ...f, images: imagesArr, imagePublicIds: publicIdsArr };
      });

      setTouchStartIndex(targetIndex);
      setDragIndex(targetIndex);
    }
  }

  function handleTouchEnd() {
    setTouchStartIndex(null);
    setDragIndex(null);
  }

  // Gestion du drag & drop pour la liste des créations
  function handleListDragStart(index: number) {
    setListDragIndex(index);
  }

  function handleListDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    if (listDragIndex === null || listDragIndex === index) return;

    setCreations((prev) => {
      const newList = [...prev];
      const [movedItem] = newList.splice(listDragIndex, 1);
      newList.splice(index, 0, movedItem);
      return newList;
    });

    setListDragIndex(index);
  }

  function handleListDragEnd() {
    setListDragIndex(null);
  }

  // Gestion du touch pour la liste des créations (mobile)
  function handleListTouchStart(index: number) {
    setListTouchStartIndex(index);
    setListDragIndex(index);
  }

  function handleListTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (listTouchStartIndex === null) return;
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const creationCard = element.closest("[data-creation-index]");
    if (!creationCard) return;

    const targetIndex = Number(creationCard.getAttribute("data-creation-index"));

    if (targetIndex !== listTouchStartIndex && targetIndex >= 0) {
      setCreations((prev) => {
        const newList = [...prev];
        const [movedItem] = newList.splice(listTouchStartIndex, 1);
        newList.splice(targetIndex, 0, movedItem);
        return newList;
      });

      setListTouchStartIndex(targetIndex);
      setListDragIndex(targetIndex);
    }
  }

  function handleListTouchEnd() {
    setListTouchStartIndex(null);
    setListDragIndex(null);
  }

  async function saveCreationOrder() {
    try {
      setSavingOrder(true);
      const orderedIds = creations.map((c) => c._id);
      
      const res = await fetch("/api/creations/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la sauvegarde");
      }

      setMessage("Ordre d'affichage sauvegardé ✔️");
      setTimeout(() => setMessage(null), 3000);
      await loadCreations(); // Recharger pour s'assurer que l'ordre est correct
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la sauvegarde de l'ordre.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleMakeAvailableAgain(id: string) {
    const ok = confirm("Remettre cet article disponible ?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/creations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sold: false,
        }),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la mise à jour");
      }

      setMessage("Article remis disponible ✔️");
      setTimeout(() => setMessage(null), 3000);
      loadCreations();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la remise en disponibilité");
    }
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Chargement...</div>
      </main>
    );
  }

  if (!session || session.user.role !== "admin") {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-2"
          >
            ← Retour à l&apos;administration
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Gestion des créations
          </h1>
        </div>

        {/* Message de succès/erreur */}
        {message && (
          <div className={`mb-4 rounded-lg p-3 text-sm ${
            message.includes("✔️") 
              ? "bg-green-50 text-green-800 border border-green-200" 
              : "bg-red-50 text-red-800 border border-red-200"
          }`}>
            {message}
          </div>
        )}

        <div className="space-y-6">
          {/* Bouton d'ajout */}
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingId(null);
                setForm({
                  title: "",
                  description: "",
                  seoDescription: "",
                  imageUrl: "",
                  images: [],
                  imagePublicIds: [],
                  price: "",
                  color: "",
                  type: "",
                  showAsNew: true,
                  yarnBrand: "",
                  weight: "",
                  yarnPrice: "",
                });
                setShowCreateModal(true);
              }}
              className="bg-slate-900 hover:bg-slate-800 cursor-pointer"
            >
              ➕ Ajouter une création
            </Button>
          </div>

          {/* Liste des créations */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                📦 Créations existantes ({creations.length})
              </h2>
              {creations.length > 1 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={saveCreationOrder}
                  disabled={savingOrder}
                  className="cursor-pointer"
                >
                  {savingOrder ? "⏳ Sauvegarde..." : "💾 Sauvegarder l'ordre"}
                </Button>
              )}
            </div>

            {loadingList && (
              <p className="text-sm text-slate-500">Chargement...</p>
            )}

            {!loadingList && creations.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">
                Aucune création pour l&apos;instant. Créez-en une ci-dessus !
              </p>
            )}

            {creations.length > 1 && (
              <>
                <p className="text-xs text-slate-500 mb-3">
                  💡 Glissez les créations pour réorganiser l&apos;ordre d&apos;affichage sur la page d&apos;accueil
                </p>
                
                {/* Barre de recherche */}
                <div className="mb-4">
                  <Input
                    type="text"
                    placeholder="🔍 Rechercher par titre, couleur, type, prix ou marque de laine..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>
                
                {/* Filtres de statut */}
                <div className="flex flex-wrap gap-2 mb-4 pb-4 pt-2 border-b border-slate-200">
                  <Button
                    size="sm"
                    variant={statusFilter === "tous" ? "primary" : "secondary"}
                    onClick={() => setStatusFilter("tous")}
                    className="cursor-pointer"
                  >
                    Tous ({creations.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={statusFilter === "disponible" ? "primary" : "secondary"}
                    onClick={() => setStatusFilter("disponible")}
                    className="cursor-pointer"
                  >
                    ✅ Disponible ({creations.filter(c => !c.sold).length})
                  </Button>
                  <Button
                    size="sm"
                    variant={statusFilter === "vendu" ? "primary" : "secondary"}
                    onClick={() => setStatusFilter("vendu")}
                    className="cursor-pointer"
                  >
                    ⚫ Vendu ({creations.filter(c => c.sold).length})
                  </Button>
                </div>

                {/* Filtre par marque de laine */}
                {yarnBrandOptions.length > 0 && (
                  <div className="mb-4 pb-4 pt-2 border-b border-slate-200">
                    <label className="text-xs font-medium text-slate-700 mb-2 block">
                      🧶 Filtrer par marque de laine
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={yarnBrandFilter === "toutes" ? "primary" : "secondary"}
                        onClick={() => setYarnBrandFilter("toutes")}
                        className="cursor-pointer"
                      >
                        Toutes ({creations.length})
                      </Button>
                      {yarnBrandOptions.map((brand) => {
                        const count = creations.filter(c => c.yarnBrand === brand).length;
                        return (
                          <Button
                            key={brand}
                            size="sm"
                            variant={yarnBrandFilter === brand ? "primary" : "secondary"}
                            onClick={() => setYarnBrandFilter(brand)}
                            className="cursor-pointer"
                          >
                            {brand} ({count})
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              {filteredCreations.map((c, index) => (
                <div
                  key={c._id}
                  data-creation-index={index}
                  draggable
                  onDragStart={() => handleListDragStart(index)}
                  onDragOver={(e) => handleListDragOver(e, index)}
                  onDragEnd={handleListDragEnd}
                  onTouchStart={() => handleListTouchStart(index)}
                  onTouchMove={handleListTouchMove}
                  onTouchEnd={handleListTouchEnd}
                  className={`relative flex flex-col gap-3 rounded-xl border bg-white p-3 transition hover:shadow-sm sm:flex-row sm:items-center sm:justify-between cursor-move ${
                    listDragIndex === index
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-slate-200"
                  }`}
                  style={{ touchAction: "none" }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600">
                      {index + 1}
                    </div>
                    {c.imageUrl && (
                      <div className="relative">
                        {c.sold && (
                          <span className="absolute left-1 top-1 z-10 rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                            Vendu
                          </span>
                        )}
                        <img
                          src={c.imageUrl}
                          alt={c.title}
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                          draggable={false}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-900">
                          {c.title}
                        </span>
                        {c.price != null && (
                          <Badge variant="default">{c.price} €</Badge>
                        )}
                        {c.type && (
                          <Badge variant="default">{c.type.charAt(0).toUpperCase() + c.type.slice(1)}</Badge>
                        )}
                        {c.color && (
                          <Badge variant="default">{c.color.charAt(0).toUpperCase() + c.color.slice(1)}</Badge>
                        )}
                      </div>
                      {c.description && (
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {c.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    {c.sold && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleMakeAvailableAgain(c._id)}
                        title="Remettre disponible"
                        className="bg-green-600 hover:bg-green-700 cursor-pointer"
                      >
                        ↻ Disponible
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedCreation(c);
                        setShowDetailModal(true);
                      }}
                      className="cursor-pointer flex items-center gap-1"
                      title="Voir les détails"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEditClick(c)}
                      className="cursor-pointer"
                    >
                      ✏️ Modifier
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(c._id)}
                      className="cursor-pointer"
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Modale d'édition */}
      {showEditModal && (
        <>
          {/* Fond semi-transparent */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fadeIn"
            onClick={handleCancelEdit}
          />
          
          <div className="fixed top-0 right-0 h-full w-full sm:w-[600px] bg-white shadow-2xl p-6 z-50 overflow-y-auto animate-slideInRight">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">✏️ Modifier la création</h2>
              <button
                onClick={handleCancelEdit}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Formulaire d'édition */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Titre *"
                placeholder="Ex : Snood rose poudré"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />

              <Textarea
                label="Description"
                placeholder="Détails, matière, pour qui..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">
                    Description complète (SEO)
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateSeoDescription}
                    className="text-xs cursor-pointer"
                  >
                    ✨ Générer automatiquement
                  </Button>
                </div>
                <Textarea
                  placeholder="Description détaillée pour le référencement, visible sous le bouton d'ajout au panier..."
                  value={form.seoDescription}
                  onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                  rows={6}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Type d'article</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                >
                  <option value="">-- Sélectionner --</option>
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Prix (€)"
                  type="number"
                  placeholder="25"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Couleur</label>
                  <select
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  >
                    <option value="">-- Sélectionner --</option>
                    {availableColors.map((color) => (
                      <option key={color} value={color}>
                        {color.charAt(0).toUpperCase() + color.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Informations admin uniquement */}
              <div className="pt-4 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                  🔒 Informations admin (non visibles pour les utilisateurs)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    label="Marque de laine"
                    placeholder="Ex : Drops, Phildar..."
                    value={form.yarnBrand}
                    onChange={(e) => setForm({ ...form, yarnBrand: e.target.value })}
                  />
                  <Input
                    label="Poids (grammes)"
                    type="number"
                    placeholder="Ex : 150"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                  />
                  <Input
                    label="Prix de la laine (€/100g)"
                    type="number"
                    step="0.01"
                    placeholder="Ex : 12.50"
                    value={form.yarnPrice}
                    onChange={(e) => setForm({ ...form, yarnPrice: e.target.value })}
                  />
                </div>
              </div>

              {/* Flag New */}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={form.showAsNew !== undefined ? form.showAsNew : true}
                  onChange={(e) => setForm({ ...form, showAsNew: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-slate-700">
                  <span className="font-semibold">Afficher le badge "New"</span>
                  <span className="ml-2 text-xs text-slate-500">(automatiquement masqué après 7 jours)</span>
                </span>
              </label>

              {/* Images */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-700">Images</label>
                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                    id="file-upload-modal"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="file-upload-modal"
                    className={`block cursor-pointer ${uploading ? 'opacity-50' : ''}`}
                  >
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200">
                      📁
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      {uploading ? "Upload en cours..." : "Cliquez pour ajouter des images"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      ou glissez-déposez vos fichiers
                    </p>
                  </label>
                </div>

                {form.images.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-700">
                      {form.images.length} image{form.images.length > 1 ? "s" : ""} ajoutée{form.images.length > 1 ? "s" : ""}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {form.images.map((url, i) => (
                        <div
                          key={i}
                          data-image-index={i}
                          draggable
                          onDragStart={() => handleDragStart(i)}
                          onDragOver={(e) => handleDragOver(e, i)}
                          onDragEnd={handleDragEnd}
                          onTouchStart={() => handleTouchStart(i)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          className={`relative aspect-square cursor-move rounded-lg overflow-hidden ${
                            dragIndex === i ? "ring-2 ring-blue-500" : "ring-1 ring-slate-200"
                          }`}
                          style={{ touchAction: "none" }}
                        >
                          <button
                            onClick={() => removeImage(i)}
                            type="button"
                            className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs hover:bg-red-600 cursor-pointer"
                          >
                            ✕
                          </button>
                          {i === 0 && (
                            <div className="absolute left-1 top-1 z-10 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              Couverture
                            </div>
                          )}
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      💡 Glissez les images pour les réordonner
                    </p>
                  </div>
                )}
              </div>

              {/* Boutons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" disabled={uploading || !form.title} className="flex-1 cursor-pointer">
                  {uploading ? "⏳ Upload..." : "💾 Mettre à jour"}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancelEdit} className="cursor-pointer">
                  Annuler
                </Button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Modale de création */}
      {showCreateModal && (
        <>
          {/* Fond semi-transparent */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fadeIn"
            onClick={handleCancelEdit}
          />
          
          <div className="fixed top-0 right-0 h-full w-full sm:w-[600px] bg-white shadow-2xl p-6 z-50 overflow-y-auto animate-slideInRight">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">➕ Ajouter une création</h2>
              <button
                onClick={handleCancelEdit}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Formulaire de création */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Titre *"
                placeholder="Ex : Snood rose poudré"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />

              <Textarea
                label="Description"
                placeholder="Détails, matière, pour qui..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">
                    Description complète (SEO)
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateSeoDescription}
                    className="text-xs cursor-pointer"
                  >
                    ✨ Générer automatiquement
                  </Button>
                </div>
                <Textarea
                  placeholder="Description détaillée pour le référencement, visible sous le bouton d'ajout au panier..."
                  value={form.seoDescription}
                  onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                  rows={6}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Type d'article</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                >
                  <option value="">-- Sélectionner --</option>
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Prix (€)"
                  type="number"
                  placeholder="25"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Couleur</label>
                  <select
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  >
                    <option value="">-- Sélectionner --</option>
                    {availableColors.map((color) => (
                      <option key={color} value={color}>
                        {color.charAt(0).toUpperCase() + color.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Informations admin uniquement */}
              <div className="pt-4 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                  🔒 Informations admin (non visibles pour les utilisateurs)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    label="Marque de laine"
                    placeholder="Ex : Drops, Phildar..."
                    value={form.yarnBrand}
                    onChange={(e) => setForm({ ...form, yarnBrand: e.target.value })}
                  />
                  <Input
                    label="Poids (grammes)"
                    type="number"
                    placeholder="Ex : 150"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                  />
                  <Input
                    label="Prix de la laine (€/100g)"
                    type="number"
                    step="0.01"
                    placeholder="Ex : 12.50"
                    value={form.yarnPrice}
                    onChange={(e) => setForm({ ...form, yarnPrice: e.target.value })}
                  />
                </div>
              </div>

              {/* Flag New */}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={form.showAsNew !== undefined ? form.showAsNew : true}
                  onChange={(e) => setForm({ ...form, showAsNew: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-slate-700">
                  <span className="font-semibold">Afficher le badge "New"</span>
                  <span className="ml-2 text-xs text-slate-500">(automatiquement masqué après 7 jours)</span>
                </span>
              </label>

              {/* Images */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-700">Images</label>
                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                    id="file-upload-create"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="file-upload-create"
                    className={`block cursor-pointer ${uploading ? 'opacity-50' : ''}`}
                  >
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200">
                      📁
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      {uploading ? "Upload en cours..." : "Cliquez pour ajouter des images"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      ou glissez-déposez vos fichiers
                    </p>
                  </label>
                </div>

                {form.images.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-700">
                      {form.images.length} image{form.images.length > 1 ? "s" : ""} ajoutée{form.images.length > 1 ? "s" : ""}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {form.images.map((url, i) => (
                        <div
                          key={i}
                          data-image-index={i}
                          draggable
                          onDragStart={() => handleDragStart(i)}
                          onDragOver={(e) => handleDragOver(e, i)}
                          onDragEnd={handleDragEnd}
                          onTouchStart={() => handleTouchStart(i)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          className={`relative aspect-square cursor-move rounded-lg overflow-hidden ${
                            dragIndex === i ? "ring-2 ring-blue-500" : "ring-1 ring-slate-200"
                          }`}
                          style={{ touchAction: "none" }}
                        >
                          <button
                            onClick={() => removeImage(i)}
                            type="button"
                            className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs hover:bg-red-600 cursor-pointer"
                          >
                            ✕
                          </button>
                          {i === 0 && (
                            <div className="absolute left-1 top-1 z-10 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              Couverture
                            </div>
                          )}
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      💡 Glissez les images pour les réordonner
                    </p>
                  </div>
                )}
              </div>

              {/* Boutons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" disabled={uploading || !form.title} className="flex-1 cursor-pointer">
                  {uploading ? "⏳ Upload..." : "➕ Créer"}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancelEdit} className="cursor-pointer">
                  Annuler
                </Button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Modale de détails */}
      {showDetailModal && selectedCreation && (
        <CreationModal
          creation={selectedCreation}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedCreation(null);
          }}
          hideActions={true}
        />
      )}
    </main>
  );
}

export default function AdminCreationsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Chargement...</div>
      </main>
    }>
      <AdminCreationsContent />
    </Suspense>
  );
}
