# ReddyFit Daily Scan - Setup Guide

This guide will walk you through setting up the ReddyFit Daily Scan system for local development.

---

## Prerequisites

Before starting, make sure you have:

- **Node.js** v18+ installed
- **npm** v9+ installed
- A **Google account** (for Gemini API)
- A **Firebase project** (already configured)
- **Git** installed

---

## Step 1: Clone and Install

```bash
# Navigate to the project
cd projects/reddyfit-social-fitness-platform

# Install dependencies
npm install

# Install Gemini AI SDK (should already be in package.json)
npm install @google/generative-ai
```

---

## Step 2: Environment Configuration

### Create `.env.local` file

Copy the example environment file:

```bash
cp .env.example .env.local
```

### Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Copy your API key

### Update `.env.local`

Open `.env.local` and add your Gemini API key:

```env
VITE_GEMINI_API_KEY=AIzaSyD...your_actual_key_here
```

**Note**: Keep this file secret and never commit it to Git!

---

## Step 3: Firebase Setup

### Verify Firebase Configuration

The Firebase config is already set up in `src/config/firebase.ts`. If you need to use your own Firebase project:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Go to **Project Settings** → **General**
4. Scroll to **Your apps** → **Web apps**
5. Copy your Firebase config
6. Update `src/config/firebase.ts` with your values

### Enable Required Firebase Services

1. **Authentication**:
   - Go to **Authentication** → **Sign-in method**
   - Enable **Google** provider
   - Add authorized domain: `localhost`

2. **Firestore Database**:
   - Go to **Firestore Database** → **Create database**
   - Choose **Start in test mode** (for development)
   - Select a location (e.g., `us-central1`)

3. **Storage**:
   - Go to **Storage** → **Get started**
   - Choose **Start in test mode**
   - This is for storing scan photos

### Configure Firestore Indexes

The Daily Scan system requires composite indexes. Create a file called `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "scans",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "scans",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

### Configure Firestore Security Rules

Create or update `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Scans collection
    match /scans/{scanId} {
      allow read: if request.auth != null &&
        (resource.data.userId == request.auth.uid || resource.data.isPublic == true);

      allow create: if request.auth != null &&
        request.resource.data.userId == request.auth.uid;

      allow update, delete: if request.auth != null &&
        resource.data.userId == request.auth.uid;
    }

    // Scan streaks collection
    match /scanStreaks/{userId} {
      allow read, write: if request.auth != null &&
        userId == request.auth.uid;
    }

    // Daily insights collection
    match /dailyInsights/{insightId} {
      allow read: if request.auth != null &&
        resource.data.userId == request.auth.uid;

      allow write: if request.auth != null &&
        request.resource.data.userId == request.auth.uid;
    }
  }
}
```

Deploy rules:

```bash
firebase deploy --only firestore:rules
```

---

## Step 4: Run the Development Server

Start the Vite dev server:

```bash
npm run dev
```

You should see:

```
VITE v7.1.7 ready in XXXXms

➜  Local:   http://localhost:5173/
```

Open your browser to `http://localhost:5173/`

---

## Step 5: Test the Daily Scan Feature

### Access the Scan Page

1. Log in with your Google account
2. Navigate to `http://localhost:5173/scan`
3. You should see the Daily Scan wizard

### Test the Flow

1. **Intro Step**:
   - Enter your current weight (e.g., `84.8`)
   - Optionally add notes
   - Click **"Start Scan"**

2. **Capture Step**:
   - Currently shows a placeholder (Camera component will be built in Phase 11-20)
   - Click **"Skip (Test Mode)"** to test the flow with mock photos

3. **Results Page**:
   - Should navigate to `/scan/results/{scanId}`
   - View body composition cards (mock data for now)

---

## Step 6: Verify Everything Works

Run the build to check for TypeScript errors:

```bash
npm run build
```

**Expected**: No errors in Daily Scan files (existing test files may have errors - this is documented)

---

## Troubleshooting

### Issue: Gemini API Error

**Symptom**: "Failed to analyze photos" or API key error

**Solution**:
1. Verify your API key is correct in `.env.local`
2. Check that you have Gemini API enabled in Google Cloud
3. Restart the dev server after changing `.env.local`

### Issue: Firebase Authentication Error

**Symptom**: Can't log in with Google

**Solution**:
1. Verify Google provider is enabled in Firebase Console
2. Add `localhost` to authorized domains
3. Check browser console for specific error messages

### Issue: Firestore Permission Denied

**Symptom**: "Missing or insufficient permissions"

**Solution**:
1. Deploy Firestore security rules
2. Ensure you're logged in
3. Check that rules allow read/write for your user ID

### Issue: Module Not Found

**Symptom**: "Cannot find module '@google/generative-ai'"

**Solution**:
```bash
npm install
```

---

## Next Steps

After completing this setup, you're ready to:

1. **Phase 11-20**: Build the Camera component for real photo capture
2. **Phase 21-30**: Integrate Gemini Vision API for actual body composition analysis
3. **Phase 31-40**: Add scan history page and charts
4. **Phase 41-50**: Write tests and improve UX

See `DAILY_SCAN_PROGRESS.md` for the full 100-phase roadmap.

---

## Project Structure

```
src/
├── types/
│   └── scan.ts                    # TypeScript types (574 lines)
├── lib/
│   └── firestore/
│       ├── scans.ts              # CRUD operations (447 lines)
│       └── scanHistory.ts        # Analytics & streaks (391 lines)
├── components/
│   └── DailyScan/
│       └── DailyScanWizard.tsx   # Main wizard component
├── pages/
│   ├── DailyScanPage.tsx         # Scan entry point
│   └── ScanResultsPage.tsx       # Results display
└── config/
    └── firebase.ts               # Firebase configuration
```

---

## Resources

- **Gemini API Docs**: https://ai.google.dev/tutorials/get_started_web
- **Firebase Docs**: https://firebase.google.com/docs
- **Firestore Queries**: https://firebase.google.com/docs/firestore/query-data/queries
- **Vite Docs**: https://vitejs.dev/
- **React Router**: https://reactrouter.com/

---

## Support

If you encounter issues:

1. Check `DAILY_SCAN_PROGRESS.md` for known limitations
2. Review the 100-phase plan for context
3. Check browser console for error messages
4. Review Firebase logs in Firebase Console

---

🎉 **You're all set!** Start developing the Daily Scan feature step by step following the 100-phase plan.
