import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import fs from "fs";

// Load Firebase config
const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Key Authentication Middleware
  const authenticateApiKey = async (req: any, res: any, next: any) => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "API Key is missing. Use 'x-api-key' header." });
    }

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("api_key", "==", apiKey), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return res.status(403).json({ error: "Invalid API Key." });
      }

      const userDoc = querySnapshot.docs[0];
      req.user = { id: userDoc.id, ...userDoc.data() };
      next();
    } catch (error) {
      console.error("Auth error:", error);
      res.status(500).json({ error: "Internal Server Error during authentication." });
    }
  };

  // API v1 Routes
  app.get("/api/v1/health", (req, res) => {
    res.json({ status: "ok", message: "API is active and ready." });
  });

  // Create Client
  app.post("/api/v1/clients", authenticateApiKey, async (req, res) => {
    const { name, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: "Client name is required." });

    try {
      const docRef = await addDoc(collection(db, "clients"), {
        name,
        phone: phone || "",
        email: email || "",
        address: address || "",
        created_at: new Date().toISOString(),
        created_by: (req as any).user.id
      });
      res.status(201).json({ id: docRef.id, message: "Client created successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to create client." });
    }
  });

  // Create Service Order
  app.post("/api/v1/orders", authenticateApiKey, async (req, res) => {
    const { client_id, description, priority, furnitureType, fabric } = req.body;
    
    if (!client_id || !description) {
      return res.status(400).json({ error: "client_id and description are required." });
    }

    try {
      // Get current order count for the number
      const ordersRef = collection(db, "service_orders");
      const q = query(ordersRef, orderBy("number", "desc"), limit(1));
      const snapshot = await getDocs(q);
      const lastNumber = snapshot.empty ? 0 : snapshot.docs[0].data().number;

      const newOrder = {
        client_id,
        description,
        priority: priority || "media",
        furnitureType: furnitureType || "",
        fabric: fabric || "",
        number: lastNumber + 1,
        status: "aberta",
        created_at: new Date().toISOString(),
        created_by: (req as any).user.id,
        checklist: [
          { id: "1", description: "Inspeção inicial", completed: false },
          { id: "2", description: "Desmontagem", completed: false },
          { id: "3", description: "Reforma", completed: false },
          { id: "4", description: "Montagem final", completed: false }
        ]
      };

      const docRef = await addDoc(collection(db, "service_orders"), newOrder);
      res.status(201).json({ id: docRef.id, number: newOrder.number, message: "Order created successfully." });
    } catch (error) {
      console.error("Order creation error:", error);
      res.status(500).json({ error: "Failed to create service order." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
