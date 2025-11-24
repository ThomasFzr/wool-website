# Wool Creations E-commerce Platform

A modern, full-stack e-commerce platform built with Next.js 15 for showcasing and selling handmade wool creations. Features include user authentication, admin dashboard, reservation system, and Cloudinary image management.

## 🚀 Features

### Public Features
- **Product Gallery** - Browse wool creations with image carousel, zoom, and filtering
- **Color & Availability Filters** - Find items by color or availability status
- **Lightbox Modal** - View high-resolution images with touch support (swipe, pinch-to-zoom)
- **Reservation System** - Reserve items directly from the modal
- **Responsive Design** - Mobile-first approach with touch gestures support

### User Features
- **Authentication** - Email/password and Google OAuth login
- **User Dashboard** - View account details
- **Reservation Management** - Track and cancel your reservations
- **Password Recovery** - Reset forgotten passwords via email

### Admin Features
- **Creation Management** - Add, edit, and delete products
- **Image Upload** - Multi-image upload with drag-and-drop reordering
- **Reservation Dashboard** - View, validate, or cancel reservations with pagination and search
- **Settings Panel** - Customize homepage title and subtitle
- **Notification Badge** - See pending reservations count in real-time

## 🛠️ Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS 4** - Utility-first styling
- **Next-Auth** - Authentication with JWT sessions

### Backend
- **MongoDB** - Database with Mongoose ODM
- **Next.js API Routes** - Server-side endpoints
- **Cloudinary** - Image hosting and optimization

### Additional Services
- **Resend** - Email delivery for password resets
- **bcryptjs** - Password hashing

## 📁 Project Structure

```
wool-starter/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── auth/                 # Authentication endpoints
│   │   ├── creations/            # Product CRUD
│   │   ├── account/              # User reservations
│   │   ├── admin/                # Admin operations
│   │   ├── register/             # User registration
│   │   └── settings/             # Site settings
│   ├── account/                  # User pages
│   ├── admin/                    # Admin pages
│   ├── login/                    # Authentication pages
│   └── page.tsx                  # Homepage
│
├── components/                   # React components
│   ├── ui/                       # Atomic UI components
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── Textarea.tsx
│   ├── Header.tsx                # Site header with auth menu
│   ├── CreationCard.tsx          # Product card
│   ├── CreationModal.tsx         # Product detail modal
│   ├── ReservationCard.tsx       # Reservation display
│   ├── Filters.tsx               # Product filters
│   └── index.ts                  # Component exports
│
├── models/                       # MongoDB models
│   ├── Creation.ts               # Product schema
│   ├── Reservation.ts            # Reservation schema
│   ├── User.ts                   # User schema
│   └── Settings.ts               # Site settings schema
│
├── lib/                          # Utilities
│   ├── db.ts                     # MongoDB connection
│   ├── auth.ts                   # Auth helpers
│   ├── cloudinary.ts             # Image upload config
│   └── sendEmail.ts              # Email service
│
└── types/                        # TypeScript declarations
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- MongoDB database
- Cloudinary account
- Google OAuth credentials (optional)
- Resend account for emails

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/ThomasFzr/wool-website.git
cd wool-website
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create a `.env.local` file:

```env
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-upload-preset
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Resend (for password reset emails)
RESEND_API_KEY=your-resend-api-key
FROM_EMAIL=noreply@yourdomain.com
```

4. **Run the development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## 🔐 Authentication Setup

### Email/Password
Users can register with email and password. Passwords are hashed with bcrypt.

### Google OAuth
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google+ API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Add credentials to `.env.local`

## 📸 Cloudinary Setup

1. Create a [Cloudinary account](https://cloudinary.com/)
2. Get your cloud name from the dashboard
3. Create an unsigned upload preset:
   - Go to Settings → Upload
   - Scroll to "Upload presets"
   - Create new preset (unsigned)
   - Copy the preset name
4. Add credentials to `.env.local`

## 📧 Email Setup (Resend)

1. Sign up at [Resend](https://resend.com/)
2. Verify your domain or use their test domain
3. Get your API key
4. Add to `.env.local`

## 👨‍💼 Admin Access

To make a user an admin:

1. Connect to your MongoDB database
2. Find the user in the `users` collection
3. Update the `role` field to `"admin"`

```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

## 🎨 Component Architecture

This project uses a component-based architecture with reusable UI elements:

- **UI Components** (`components/ui/`) - Atomic, reusable components (Button, Badge, Card, Input, Textarea)
- **Feature Components** - Complex components with business logic (Header, CreationCard, CreationModal, ReservationCard, Filters)
- **Centralized Exports** - Import all components from `@/components`

See `components/README.md` for detailed component documentation.

## 🗃️ Database Schema

### Creation
- Title, description, color, price
- Multiple images with Cloudinary public IDs
- Reserved/sold status

### Reservation
- Reference to creation
- User information (name, contact, email)
- Status (pending, validated, cancelled)
- Cancellation reason and initiator

### User
- Email, password (hashed), name
- Role (user/admin)
- OAuth provider info

### Settings
- Homepage title and subtitle

## 📱 Mobile Support

- Touch gestures in image modal (swipe, pinch-to-zoom, double-tap)
- Responsive grid layout
- Mobile-optimized navigation menu

## 🔒 Security Features

- Password hashing with bcrypt
- JWT-based sessions
- Protected API routes with authentication middleware
- Admin-only routes protection
- CSRF protection via NextAuth

## 🚧 Roadmap

- [ ] Payment integration (Stripe/PayPal)
- [ ] Order history and tracking
- [ ] Email notifications for reservation status
- [ ] Product categories and tags
- [ ] Wishlist functionality
- [ ] Product reviews and ratings
- [ ] Dark mode support
- [ ] Multi-language support

## 📄 License

This project is private and proprietary.

## 👤 Author

**Thomas Foltzer**
- GitHub: [@ThomasFzr](https://github.com/ThomasFzr)

## 🤝 Contributing

This is a private project. For issues or suggestions, please contact the repository owner.

---

Built with ❤️ using Next.js and React
