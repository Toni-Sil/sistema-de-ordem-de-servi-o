import React, { useState, useEffect, useRef } from 'react';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Settings,
  Plus,
  Search,
  Bell,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  MoreVertical,
  MapPin,
  X,
  Loader2,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  User,
  Key,
  History,
  Filter,
  Calendar as CalendarIcon,
  Briefcase,
  Package,
  LogOut,
  SearchX,
  Sun,
  Moon,
  Sofa,
  Scissors,
  Hammer,
  Mic,
  Wand2,
  Phone,
  MessageSquare,
  Trash2,
  Share2,
  Camera,
  Image as ImageIcon,
  BarChart as BarChartIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { ServiceOrder, DashboardStats, OSPriority, OSStatus, UserProfile, Client, UserRole, Service } from './types';
import jsPDF from 'jspdf';
import { VoiceAssistant } from './components/VoiceAssistant';
import { GoogleGenAI } from "@google/genai";
import Logo from './components/Logo';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  signInAnonymously,
  onAuthStateChanged,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  FirebaseUser,
  handleFirestoreError,
  OperationType
} from './firebase';

type Tab = 'dashboard' | 'orders' | 'agenda' | 'profile';
type ManagementView = 'none' | 'clients' | 'techs' | 'services' | 'settings' | 'api_key';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [managementView, setManagementView] = useState<ManagementView>('none');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [techs, setTechs] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('GEMINI_API_KEY') || '');
  const [aiProvider, setAiProvider] = useState(localStorage.getItem('AI_PROVIDER') || 'gemini');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [alertMessage, setAlertMessage] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [selectedOS, setSelectedOS] = useState<ServiceOrder | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState<'TODAS' | 'ABERTAS' | 'EM CURSO' | 'CONCLUÍDAS'>('TODAS');
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(new Date());
  const [agendaView, setAgendaView] = useState<'DIA' | 'SEMANA' | 'MÊS'>('DIA');
  const [agendaPriorityFilter, setAgendaPriorityFilter] = useState<OSPriority | 'todas'>('todas');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [notifications, setNotifications] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' ? Notification.permission : 'default'
  );
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', address: '' });
  const [newTech, setNewTech] = useState({ name: '', email: '', role: 'tecnico' as UserRole });
  const [newService, setNewService] = useState({ name: '', description: '' });
  const [regType, setRegType] = useState<'manual' | 'google'>('manual');
  const [formData, setFormData] = useState({
    client_id: '',
    service_id: '',
    description: '',
    priority: 'media' as OSPriority,
    assigned_to: '',
    furnitureType: '',
    fabric: '',
    truckPlate: '',
    truckModel: '',
    value: '',
    paymentMethod: '',
    notes: '',
    deadline: '',
    isReadyForInstallation: false
  });
  const [isDraftRecovered, setIsDraftRecovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save logic
  useEffect(() => {
    const savedDraft = localStorage.getItem('os_draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        setFormData(prev => ({ ...prev, ...parsed }));
        setIsDraftRecovered(true);
        setTimeout(() => setIsDraftRecovered(false), 5000);
      } catch (e) {
        console.error('Error recovering draft:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('os_draft', JSON.stringify(formData));
  }, [formData]);

  const clearDraft = () => {
    setFormData({
      client_id: '',
      service_id: '',
      description: '',
      priority: 'media',
      assigned_to: '',
      furnitureType: '',
      fabric: '',
      truckPlate: '',
      truckModel: '',
      value: '',
      paymentMethod: '',
      notes: '',
      deadline: '',
      isReadyForInstallation: false
    });
    localStorage.removeItem('os_draft');
  };

  const handleVoiceData = (data: any) => {
    setFormData(prev => ({
      ...prev,
      client_id: data.client_id || prev.client_id,
      description: data.description || prev.description,
      priority: data.priority || prev.priority,
      furnitureType: data.furnitureType || prev.furnitureType,
      fabric: data.fabric || prev.fabric,
      truckPlate: data.truckPlate || prev.truckPlate,
      truckModel: data.truckModel || prev.truckModel,
      deadline: data.deadline || prev.deadline,
      value: data.value || prev.value
    }));

    const sanitizeStr = (s: any) => s === "null" || s === "undefined" || s === "" ? null : s;
    const cid = sanitizeStr(data.client_id);
    const cname = sanitizeStr(data.clientName);
    const cphone = sanitizeStr(data.whatsapp);

    // If a new client name or WhatsApp was mentioned but not found in ID
    if (!cid && (cname || cphone)) {
      setConfirmAction({
        title: 'NOVO_CLIENTE_DETECTADO',
        message: `O CLIENTE "${cname || 'DESCONHECIDO'}" NÃO FOI ENCONTRADO. DESEJA CADASTRÁ-LO AGORA?`,
        onConfirm: async () => {
          try {
            const docRef = await addDoc(collection(db, 'clients'), {
              name: cname || 'Novo Cliente',
              phone: cphone || '',
              email: '',
              address: '',
              created_at: new Date().toISOString()
            });
            setFormData(prev => ({ ...prev, client_id: docRef.id }));
            setConfirmAction(null);
            setAlertMessage({
              title: 'CLIENTE_CADASTRADO',
              message: 'O NOVO CLIENTE FOI REGISTRADO E VINCULADO À ESTA OS.',
              type: 'success'
            });
          } catch (error: any) {
            setConfirmAction(null);
            console.error('Save error:', error);
            alert("A gravação falhou. A permissão pode estar negada.\nDetalhes: " + error.message);
          }
        }
      });
    }
  };

  const userProfileRef = useRef<UserProfile | null>(null);
  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  };

  const showPushNotification = (title: string, body: string) => {
    if (!notifications || notificationPermission !== 'granted') return;

    try {
      const notification = new Notification(title, {
        body,
        icon: 'https://cdn-icons-png.flaticon.com/512/3119/3119338.png',
        tag: 'new-os-alert'
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.error('Erro ao mostrar notificação:', err);
    }
  };

  const optimizeProfileUrl = (url: string | undefined, size: number = 96) => {
    if (!url) return undefined;
    if (url.includes('googleusercontent.com')) {
      const baseUrl = url.split('=')[0];
      return `${baseUrl}=s${size}-c`;
    }
    return url;
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const existingProfile = userDoc.data() as UserProfile;
            // Sync Google info if it changed
            if (existingProfile.name !== (currentUser.displayName || 'Usuário') ||
              existingProfile.photoURL !== (currentUser.photoURL || undefined)) {
              const updatedProfile = {
                ...existingProfile,
                name: currentUser.displayName || existingProfile.name,
                photoURL: currentUser.photoURL || existingProfile.photoURL
              };
              await updateDoc(doc(db, 'users', currentUser.uid), updatedProfile);
              setUserProfile(updatedProfile);
            } else {
              setUserProfile(existingProfile);
            }
          } else {
            // Check if there's a manual entry with this email
            const manualQuery = query(collection(db, 'users'), where('email', '==', currentUser.email));
            const manualSnap = await getDocs(manualQuery);

            if (!manualSnap.empty) {
              const manualDoc = manualSnap.docs[0];
              const manualData = manualDoc.data() as UserProfile;

              // Link this Google account to the manual entry
              const linkedProfile: UserProfile = {
                ...manualData,
                id: currentUser.uid, // Update ID to Google UID
                name: currentUser.displayName || manualData.name,
                photoURL: currentUser.photoURL || undefined,
              };

              // Delete the manual entry and create the new linked one
              await deleteDoc(doc(db, 'users', manualDoc.id));
              await setDoc(doc(db, 'users', currentUser.uid), linkedProfile);
              setUserProfile(linkedProfile);
            } else {
              // Determine default role
              const defaultAdmins = ["roselinovais513@gmail.com", "adaoantonio248@gmail.com"];
              const role = defaultAdmins.includes(currentUser.email || '') ? 'admin' : 'tecnico';

              const newProfile: UserProfile = {
                id: currentUser.uid,
                name: currentUser.displayName || 'Usuário',
                email: currentUser.email || '',
                role: role,
                photoURL: currentUser.photoURL || undefined,
                created_at: new Date().toISOString()
              };
              await setDoc(doc(db, 'users', currentUser.uid), newProfile);
              setUserProfile(newProfile);
            }
          }
        } catch (error) {
          console.error('Error fetching/creating user profile:', error);
          // Fallback to basic profile if Firestore fails (e.g. permission denied)
          setUserProfile({
            id: currentUser.uid,
            name: currentUser.displayName || 'Usuário',
            email: currentUser.email || '',
            role: 'tecnico',
            photoURL: currentUser.photoURL || undefined,
            created_at: new Date().toISOString()
          });
        }
      } else {
        setUser(prev => prev?.uid === 'admin_local' ? prev : null);
        setUserProfile(prev => prev?.id === 'admin_local' ? prev : null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    let isFirstLoad = true;
    const q = query(collection(db, 'service_orders'), orderBy('created_at', 'desc'));
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ServiceOrder[];

      if (!isFirstLoad && userProfileRef.current && (userProfileRef.current.role === 'admin' || userProfileRef.current.role === 'gestor')) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const newOS = change.doc.data() as ServiceOrder;
            const clientName = clients.find(c => c.id === newOS.client_id)?.name || 'Cliente';
            showPushNotification('Nova Ordem de Serviço', `Uma nova OS foi criada para ${clientName}.`);
          }
        });
      }
      isFirstLoad = false;
      setOrders(ordersData);

      // Update stats
      const total = ordersData.length;
      const open = ordersData.filter(o => o.status === 'aberta').length;
      const inProgress = ordersData.filter(o => o.status === 'em_andamento').length;
      const completed = ordersData.filter(o => o.status === 'concluida').length;
      setStats({ total, open, inProgress, completed });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'service_orders'));

    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Client[];
      setClients(clientsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'clients'));

    const unsubscribeTechs = onSnapshot(collection(db, 'users'), (snapshot) => {
      const techsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserProfile[];
      setTechs(techsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const unsubscribeServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      const servicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Service[];
      setServices(servicesData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'services'));

    return () => {
      unsubscribeOrders();
      unsubscribeClients();
      unsubscribeTechs();
      unsubscribeServices();
    };
  }, [user]);

  useEffect(() => {
    if (selectedOS) {
      const updated = orders.find(o => o.id === selectedOS.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedOS)) {
        setSelectedOS(updated);
      }
    }
  }, [orders, selectedOS]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleLogin = async () => {
    try {
      setIsSubmitting(true);
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user as any);

      // Setup the user in our specific users table if necessary
      const userRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        const newUserProfile: UserProfile = {
          id: result.user.uid,
          name: result.user.displayName || 'Usuário',
          email: result.user.email || '',
          role: 'admin', // First user fallback
          created_at: new Date().toISOString()
        };
        await setDoc(userRef, newUserProfile);
        setUserProfile(newUserProfile);
      } else {
        setUserProfile(userDoc.data() as UserProfile);
      }

      await requestNotificationPermission();
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/unauthorized-domain') {
        alert("O Firebase bloqueou este acesso porque o 'localhost' não está na lista de domínios seguros.\n\nPara consertar definitivamente e recuperar seus poderes de Admin:\n1. Acesse e faça login no seu Console do Firebase.\n2. Vá no menu esquerdo em 'Authentication' (Autenticação)\n3. Clique na aba superior 'Settings' (Configurações)\n4. Vá em 'Authorized domains' (Domínios autorizados)\n5. Clique em 'Add domain' e adicione a palavra: localhost\n6. Tente logar de novo aqui no sistema!");
      } else {
        alert('Erro ao tentar conectar via Google:\n' + (error.message || JSON.stringify(error)));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      setSelectedOS(null);
      setManagementView('none');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setIsSubmitting(true);
    try {
      let isValid = false;
      let errorDetalhes = "";

      if (aiProvider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await response.json();
        if (response.ok) {
          isValid = true;
        } else {
          errorDetalhes = data.error?.message || response.statusText;
        }
      } else {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Say 'OK'" }] }]
          })
        });
        const data = await response.json();
        if (response.ok && data) {
          isValid = true;
        } else {
          errorDetalhes = data.error?.message || response.statusText;
        }
      }

      if (isValid) {
        localStorage.setItem('GEMINI_API_KEY', apiKey);
        localStorage.setItem('AI_PROVIDER', aiProvider);
        setManagementView('none');
        setAlertMessage({
          title: 'IA_VALIDADA_COM_SUCESSO',
          message: `O ASSISTENTE ESTÁ FUNCIONANDO VIA ${aiProvider.toUpperCase()}.`,
          type: 'success'
        });
      } else {
        alert(`Não foi possível validar. O servidor da IA respondeu com falha.\n\nDetalhes do erro: ${errorDetalhes}`);
      }
    } catch (error: any) {
      alert('Houve um erro de conexão de rede:\n' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateApiKey = async () => {
    if (!user) return;
    const newApiKey = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        api_key: newApiKey
      });
      if (userProfile) {
        setUserProfile({ ...userProfile, api_key: newApiKey });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name) {
      alert("O nome do cliente é obrigatório!");
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'clients'), {
        ...newClient,
        created_at: new Date().toISOString()
      });
      setNewClient({ name: '', phone: '', email: '', address: '' });
      setManagementView('none');
      alert("Cliente cadastrado com sucesso!");
    } catch (error: any) {
      console.error('Save error:', error);
      alert("Falha ao registrar cliente. O servidor não aceitou a gravação. Detalhes: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTech.name || !newTech.email) return;
    setIsSubmitting(true);
    try {
      const existing = techs.find(t => t.email === newTech.email);
      if (existing) {
        setAlertMessage({
          title: 'ERRO_SISTEMA',
          message: 'ESTE E-MAIL JÁ ESTÁ CADASTRADO NO BANCO DE DADOS.',
          type: 'error'
        });
        return;
      }

      const techId = `manual_${Date.now()}`;
      await setDoc(doc(db, 'users', techId), {
        id: techId,
        ...newTech,
        registration_method: regType,
        created_at: new Date().toISOString()
      });
      setNewTech({ name: '', email: '', role: 'tecnico' });
      setAlertMessage({
        title: 'SUCESSO_SISTEMA',
        message: `TÉCNICO REGISTRADO COM SUCESSO (${regType.toUpperCase()}).`,
        type: 'success'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTech = async (techId: string) => {
    setConfirmAction({
      title: 'REMOVER_TÉCNICO',
      message: 'TEM CERTEZA QUE DESEJA REMOVER ESTE COLABORADOR DO SISTEMA?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', techId));
          setConfirmAction(null);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `users/${techId}`);
        }
      }
    });
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newService.name) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'services'), {
        ...newService,
        created_at: new Date().toISOString()
      });
      setNewService({ name: '', description: '' });
      setAlertMessage({
        title: 'SERVIÇO_ADICIONADO',
        message: 'NOVO TIPO DE SERVIÇO REGISTRADO COM SUCESSO.',
        type: 'success'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'services');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    setConfirmAction({
      title: 'REMOVER_SERVIÇO',
      message: 'ESTE SERVIÇO SERÁ REMOVIDO PERMANENTEMENTE DA LISTA.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'services', serviceId));
          setConfirmAction(null);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `services/${serviceId}`);
        }
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    try {
      const newOrder = {
        ...formData,
        number: orders.length + 1,
        status: 'aberta' as OSStatus,
        created_at: new Date().toISOString()
      };
      await addDoc(collection(db, 'service_orders'), newOrder);
      setIsModalOpen(false);
      clearDraft();
      setAlertMessage({
        title: 'OS_INICIALIZADA',
        message: 'A NOVA ORDEM DE SERVIÇO FOI REGISTRADA COM SUCESSO.',
        type: 'success'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'service_orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleInstallationReady = async (osId: string) => {
    const os = orders.find(o => o.id === osId);
    if (!os) return;

    try {
      await updateDoc(doc(db, 'service_orders', osId), { isReadyForInstallation: !os.isReadyForInstallation });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `service_orders/${osId}`);
    }
  };

  const updateOSStatus = async (osId: string, status: OSStatus, installationPhoto?: string) => {
    setIsFinalizing(true);
    try {
      const updateData: any = { status };
      if (installationPhoto) updateData.installationPhoto = installationPhoto;
      await updateDoc(doc(db, 'service_orders', osId), updateData);
      setIsPhotoModalOpen(false);
      setCapturedPhoto(null);
      setPhotoError(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `service_orders/${osId}`);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with 0.7 quality to stay well under 1MB
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setCapturedPhoto(dataUrl);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFinishOS = () => {
    if (!capturedPhoto) {
      setPhotoError('Por favor, anexe uma foto do produto instalado.');
      return;
    }
    if (selectedOS) {
      updateOSStatus(selectedOS.id, 'concluida', capturedPhoto);
    }
  };

  const handleDeleteOS = async (osId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'service_orders', osId));
      setSelectedOS(null);
      setIsDeleteConfirmOpen(false);
      setAlertMessage({
        title: 'OS_REMOVIDA',
        message: 'A ORDEM DE SERVIÇO FOI EXCLUÍDA PERMANENTEMENTE.',
        type: 'success'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `service_orders/${osId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    setConfirmAction({
      title: 'REMOVER_CLIENTE',
      message: 'TEM CERTEZA QUE DESEJA REMOVER ESTE CLIENTE E TODOS OS SEUS DADOS?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'clients', clientId));
          setConfirmAction(null);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `clients/${clientId}`);
        }
      }
    });
  };

  const generateOSPDF = (os: ServiceOrder) => {
    const client = clients.find(c => c.id === os.client_id);
    const service = services.find(s => s.id === os.service_id);
    const tech = techs.find(t => t.id === os.assigned_to);

    const doc = new jsPDF();

    // Header - Logo and Title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('SÓ SOFÁ-CAMA PARA CAMINHÕES', 105, 50, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('■ (19) 97408-2143 | ■ Sumaré/SP', 105, 58, { align: 'center' });
    doc.text('Instagram: @sofacamaparacaminhoes', 105, 64, { align: 'center' });

    // OS Number and Date
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ORDEM DE SERVIÇO Nº: ' + os.number, 15, 80);
    doc.text('Data: ' + new Date(os.created_at).toLocaleDateString('pt-BR'), 15, 88);

    // Client Info
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente: ', 15, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(client?.name || '', 35, 100);
    doc.line(35, 101, 195, 101);

    doc.setFont('helvetica', 'bold');
    doc.text('Telefone: ', 15, 108);
    doc.setFont('helvetica', 'normal');
    doc.text(client?.phone || '', 35, 108);
    doc.line(35, 109, 195, 109);

    doc.setFont('helvetica', 'bold');
    doc.text('Caminhão: ', 15, 116);
    doc.setFont('helvetica', 'normal');
    let truckInfo = os.truckModel ? ` - ${os.truckModel}` : '';
    truckInfo += os.truckPlate ? ` (Placa: ${os.truckPlate})` : '';
    doc.text(`${os.furnitureType || ''}${truckInfo}`, 38, 116);
    doc.line(38, 117, 195, 117);

    // Service Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Serviço a ser realizado:', 15, 130);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const splitDescription = doc.splitTextToSize(os.description || '', 180);
    doc.text(splitDescription, 15, 140);

    // Draw lines for service description
    for (let i = 0; i < 4; i++) {
      doc.line(15, 142 + (i * 8), 195, 142 + (i * 8));
    }

    // Financial and Delivery
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Valor: R$ ', 15, 185);
    doc.setFont('helvetica', 'normal');
    doc.text(os.value || '', 35, 185);
    doc.line(35, 186, 100, 186);

    doc.setFont('helvetica', 'bold');
    doc.text('Pagamento: ', 15, 193);
    doc.setFont('helvetica', 'normal');
    doc.text(os.paymentMethod || '', 42, 193);
    doc.line(42, 194, 100, 194);

    doc.setFont('helvetica', 'bold');
    doc.text('Data de entrega: ', 15, 205);
    doc.setFont('helvetica', 'normal');
    doc.text(os.deadline ? new Date(os.deadline).toLocaleDateString('pt-BR') : '', 50, 205);
    doc.line(50, 206, 100, 206);

    // Observations
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Observações:', 15, 220);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(os.notes || '', 180);
    doc.text(splitNotes, 15, 230);

    // Draw lines for observations
    for (let i = 0; i < 3; i++) {
      doc.line(15, 232 + (i * 8), 195, 232 + (i * 8));
    }

    // Signatures
    const footerY = 270;
    doc.setFontSize(10);
    doc.text('Cliente', 60, footerY - 5, { align: 'center' });
    doc.line(30, footerY, 90, footerY);

    doc.text('Responsável', 150, footerY - 5, { align: 'center' });
    doc.line(120, footerY, 180, footerY);

    doc.save(`OS_${os.number}_${client?.name || 'Cliente'}.pdf`);
  };

  const shareOnWhatsApp = (os: ServiceOrder) => {
    const client = clients.find(c => c.id === os.client_id);
    const service = services.find(s => s.id === os.service_id);

    const message = `*SÓ SOFÁ CAMA - ORDEM DE SERVIÇO Nº ${os.number}*
    
*Cliente:* ${client?.name || 'Não informado'}
*Caminhão:* ${os.truckModel || 'Não informado'} - Placa: ${os.truckPlate || 'Não informada'}
*Serviço:* ${service?.name || 'Geral'}
*Móvel:* ${os.furnitureType || 'Não informado'}
*Tecido:* ${os.fabric || 'Não informado'}
*Valor:* R$ ${os.value || '0,00'}
*Pagamento:* ${os.paymentMethod || 'Não informado'}
*Status:* ${os.status.toUpperCase()}
*Prioridade:* ${getDynamicPriority(os).toUpperCase()}

*Descrição:*
${os.description}

*Observações:*
${os.notes || 'Nenhuma'}

*Data:* ${new Date(os.created_at).toLocaleDateString('pt-BR')}

_Enviado via Sistema de Gestão Só Sofá Cama_`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${client?.phone?.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const getWeekDays = (baseDate: Date) => {
    const days = [];
    const start = startOfWeek(baseDate, { weekStartsOn: 0 });
    for (let i = 0; i < 7; i++) {
      days.push(addDays(start, i));
    }
    return days;
  };

  const weekDays = getWeekDays(selectedAgendaDate);

  const getMonthDays = (baseDate: Date) => {
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days = [];
    let day = startDate;
    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  };

  const monthDays = getMonthDays(selectedAgendaDate);

  const navigateAgenda = (direction: 'prev' | 'next') => {
    if (agendaView === 'DIA') {
      setSelectedAgendaDate(prev => direction === 'next' ? addDays(prev, 1) : addDays(prev, -1));
    } else if (agendaView === 'SEMANA') {
      setSelectedAgendaDate(prev => direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1));
    } else {
      setSelectedAgendaDate(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
    }
  };

  const agendaOrders = orders.filter(os => {
    if (!os.deadline) return false;
    const osDate = new Date(os.deadline);
    const matchesDate = isSameDay(osDate, selectedAgendaDate);
    const matchesPriority = agendaPriorityFilter === 'todas' || os.priority === agendaPriorityFilter;
    return matchesDate && matchesPriority;
  });

  const getOrdersForDate = (date: Date) => {
    return orders.filter(os => {
      if (!os.deadline) return false;
      const matchesDate = isSameDay(new Date(os.deadline), date);
      const matchesPriority = agendaPriorityFilter === 'todas' || os.priority === agendaPriorityFilter;
      return matchesDate && matchesPriority;
    });
  };

  const filteredOrders = orders.filter(os => {
    const client = clients.find(c => c.id === os.client_id)?.name || 'Cliente Desconhecido';
    const matchesSearch = client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      os.number.toString().includes(searchQuery.toLowerCase()) ||
      os.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (orderFilter === 'TODAS') return true;
    if (orderFilter === 'ABERTAS') return os.status === 'aberta';
    if (orderFilter === 'EM CURSO') return os.status === 'em_andamento';
    if (orderFilter === 'CONCLUÍDAS') return os.status === 'concluida';

    return true;
  });

  const chartData = [
    { name: 'Abertas', value: stats?.open || 0, color: '#dc2626' },
    { name: 'Em Progresso', value: stats?.inProgress || 0, color: '#f59e0b' },
    { name: 'concluida', value: stats?.completed || 0, color: '#10b981' },
  ];

  const pieData = [
    { name: 'Abertas', value: stats?.open || 0, fill: '#dc2626' },
    { name: 'Em Progresso', value: stats?.inProgress || 0, fill: '#f59e0b' },
    { name: 'concluida', value: stats?.completed || 0, fill: '#10b981' },
  ];

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-brand-dark transition-colors">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-16 h-16 border-4 border-brand-red border-t-transparent rounded-full mb-6"
        />
        <span className="technical-label text-brand-red animate-pulse">SISTEMA DE GESTÃO • CARREGANDO...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col bg-brand-dark p-8 relative overflow-hidden technical-grid">
        <div className="scanline" />

        {/* Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-red to-transparent opacity-50" />
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-red to-transparent opacity-50" />

        <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full space-y-16 relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8 text-center"
          >
            <div className="relative inline-block">
              <div className="w-24 h-24 bg-white rounded-none flex items-center justify-center glow-red mx-auto relative z-10 overflow-hidden p-2">
                <Logo />
              </div>
              <div className="absolute -inset-4 border border-brand-red/20 animate-pulse" />
              <div className="absolute -inset-8 border border-brand-red/10" />
            </div>

            <div className="space-y-4">
              <div className="flex flex-col items-center">
                <span className="technical-label text-brand-red mb-2 tracking-[0.4em]">SISTEMA DE GESTÃO v2.5</span>
                <h1 className="text-5xl font-black tracking-tighter leading-none uppercase italic">
                  SÓ SOFÁ <span className="text-brand-red">CAMA</span><br />
                  PARA CAMINHÕES
                </h1>
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="h-[1px] w-8 bg-brand-line" />
                <p className="technical-label text-slate-500">ESTOFADOS • REFORMAS • CONFORTO</p>
                <div className="h-[1px] w-8 bg-brand-line" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-8"
          >
            <div className="technical-card p-1">
              <button
                onClick={handleLogin}
                className="w-full py-6 bg-brand-red text-white font-black uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-white hover:text-brand-red transition-all active:scale-[0.98]"
              >
                <LayoutDashboard size={24} strokeWidth={2.5} />
                INICIAR TERMINAL
              </button>
            </div>

            <div className="text-center space-y-2">
              <p className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                * NOVOS USUÁRIOS SERÃO REGISTRADOS AUTOMATICAMENTE COMO TAPECEIROS.
              </p>
              <p className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                PARA ACESSO GESTOR/ADMIN, SOLICITE VÍNCULO AO ADMINISTRADOR.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="technical-label text-[8px]">STATUS</span>
                <span className="text-[10px] font-mono text-emerald-500">ONLINE</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="technical-label text-[8px]">SEGURANÇA</span>
                <span className="text-[10px] font-mono text-slate-400">SSL/TLS</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="technical-label text-[8px]">ACESSO</span>
                <span className="text-[10px] font-mono text-slate-400">RESTRITO</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Corner Accents */}
        <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-brand-red/30" />
        <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-brand-red/30" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-brand-red/30" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-brand-red/30" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-brand-dark text-slate-100 overflow-hidden font-sans select-none technical-grid">
      <div className="scanline" />

      {/* Main Header */}
      <header className="bg-brand-surface border-b border-brand-border px-6 py-4 flex items-center justify-between shrink-0 z-20 relative">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-brand-red/30" />

        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-white rounded-none flex items-center justify-center glow-red relative group overflow-hidden">
            <Logo />
            <div className="absolute -inset-1 border border-brand-red/20 group-hover:border-brand-red/50 transition-colors" />
          </div>
          <div className="flex flex-col">
            <h2 className="font-black text-xl tracking-tighter leading-none uppercase italic">SÓ SOFÁ <span className="text-brand-red">CAMA</span></h2>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="technical-label text-slate-500 tracking-[0.3em]">TERMINAL OPERACIONAL</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end mr-4 border-r border-brand-line pr-4">
            <span className="technical-label text-[8px]">OPERADOR</span>
            <span className="technical-value text-xs">{user?.displayName?.split(' ')[0] || 'ADMIN'}</span>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`p-3 rounded-none transition-all duration-300 border ${isSearchOpen ? 'bg-brand-red border-brand-red text-white glow-red' : 'bg-brand-surface border-brand-border text-slate-500 hover:text-white hover:border-brand-line'}`}
            >
              <Search size={20} />
            </motion.button>
            <div className="relative">
              <button className="p-3 bg-brand-surface border border-brand-border rounded-none text-slate-500 hover:text-white hover:border-brand-line transition-all">
                <Bell size={20} />
              </button>
              <div className="absolute top-3 right-3 w-2 h-2 bg-brand-red rounded-full border-2 border-brand-dark" />
            </div>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <AnimatePresence>
        {isSearchOpen && !selectedOS && managementView === 'none' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-brand-surface border-b border-brand-border px-6 py-4 overflow-hidden z-10"
          >
            <div className="relative max-w-2xl mx-auto">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <Search className="text-brand-red" size={18} />
                <div className="w-[1px] h-4 bg-brand-line" />
              </div>
              <input
                autoFocus
                type="text"
                placeholder="BUSCAR NO BANCO DE DADOS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-brand-dark border border-brand-border rounded-none pl-14 pr-4 py-4 text-sm font-mono uppercase tracking-widest text-white outline-none focus:border-brand-red transition-all placeholder:text-slate-700"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <span className="technical-label text-[8px] opacity-30">CMD + F</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          {selectedOS ? (
            <motion.div
              key="os-detail"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-brand-dark z-30 flex flex-col transition-colors technical-grid"
            >
              <div className="p-6 space-y-8 overflow-y-auto flex-1">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="technical-label text-brand-red">OS-{selectedOS.number.toString().padStart(4, '0')}</span>
                      <div className="w-1 h-1 rounded-full bg-brand-red animate-pulse" />
                    </div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-3xl font-black tracking-tight uppercase italic">
                        {clients.find(c => c.id === selectedOS.client_id)?.name || 'CLIENTE_NULL'}
                      </h2>
                      {clients.find(c => c.id === selectedOS.client_id)?.phone && (
                        <a
                          href={`https://wa.me/${clients.find(c => c.id === selectedOS.client_id)?.phone?.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 bg-brand-surface border border-brand-border text-emerald-500 hover:border-emerald-500 transition-colors"
                        >
                          <MessageSquare size={18} />
                        </a>
                      )}
                    </div>
                  </div>
                  <PriorityBadge
                    priority={getDynamicPriority(selectedOS)}
                    isEscalated={getDynamicPriority(selectedOS) !== selectedOS.priority}
                  />
                </div>

                <div className="technical-card p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="technical-label text-[8px]">CAMINHÃO / PLACA</span>
                      <p className="text-xs font-mono text-white uppercase">{selectedOS.truckModel ? `${selectedOS.truckModel} (${selectedOS.truckPlate || 'S/ Placa'})` : 'N/A'}</p>
                    </div>
                    <div className="space-y-2">
                      <span className="technical-label text-[8px]">TIPO_MÓVEL</span>
                      <p className="text-xs font-mono text-white uppercase">{selectedOS.furnitureType || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="technical-label text-[8px]">TECIDO</span>
                      <p className="text-xs font-mono text-white uppercase">{selectedOS.fabric || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="technical-label text-[8px]">VALOR_TOTAL</span>
                      <p className="text-xs font-mono text-emerald-500 uppercase">R$ {selectedOS.value || '0,00'}</p>
                    </div>
                    <div className="space-y-2">
                      <span className="technical-label text-[8px]">PAGAMENTO</span>
                      <p className="text-xs font-mono text-white uppercase">{selectedOS.paymentMethod || 'N/A'}</p>
                    </div>
                  </div>

                  {selectedOS.notes && (
                    <div className="space-y-2">
                      <span className="technical-label text-[8px]">OBSERVAÇÕES</span>
                      <p className="text-xs font-mono text-slate-400 uppercase leading-relaxed">{selectedOS.notes}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="w-1 h-3 bg-brand-red" />
                    <span className="technical-label">DESCRIÇÃO_TÉCNICA</span>
                  </div>
                  <p className="text-slate-300 font-mono text-sm leading-relaxed uppercase">{selectedOS.description}</p>

                  {(selectedOS.furnitureType || selectedOS.fabric) && (
                    <div className="grid grid-cols-2 gap-6 pt-6 border-t border-brand-line">
                      {selectedOS.furnitureType && (
                        <div>
                          <span className="technical-label text-[8px] block mb-1">MÓVEL_REF</span>
                          <span className="text-sm font-black uppercase italic">{selectedOS.furnitureType}</span>
                        </div>
                      )}
                      {selectedOS.fabric && (
                        <div>
                          <span className="technical-label text-[8px] block mb-1">TECIDO_REF</span>
                          <span className="text-sm font-black uppercase italic">{selectedOS.fabric}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="technical-card p-4 flex items-center gap-3">
                    <User size={16} className="text-brand-red" />
                    <div className="flex flex-col">
                      <span className="technical-label text-[7px]">OPERADOR</span>
                      <span className="text-[10px] font-bold uppercase">{selectedOS.assigned_to || 'NÃO_ATRIBUÍDO'}</span>
                    </div>
                  </div>
                  <div className="technical-card p-4 flex items-center gap-3">
                    <CalendarIcon size={16} className="text-brand-red" />
                    <div className="flex flex-col">
                      <span className="technical-label text-[7px]">DATA_REGISTRO</span>
                      <span className="text-[10px] font-bold uppercase">{new Date(selectedOS.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {selectedOS.deadline && (
                    <div className="technical-card p-4 flex items-center gap-3 border-brand-red/50 col-span-2">
                      <Clock size={16} className="text-brand-red" />
                      <div className="flex flex-col">
                        <span className="technical-label text-brand-red text-[7px]">DATA_ENTREGA (DEADLINE)</span>
                        <span className="text-[10px] font-black uppercase italic text-brand-red">{new Date(selectedOS.deadline).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-2 h-2 bg-brand-red rotate-45" />
                    <h3 className="font-black text-lg uppercase italic">STATUS_INSTALAÇÃO</h3>
                  </div>
                  <button
                    onClick={() => toggleInstallationReady(selectedOS.id)}
                    className={`w-full flex items-center gap-4 p-5 technical-card transition-all text-left group ${selectedOS.isReadyForInstallation
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'hover:border-brand-line'
                      }`}
                  >
                    <div className={`w-6 h-6 border flex items-center justify-center transition-colors ${selectedOS.isReadyForInstallation ? 'bg-emerald-500 border-emerald-500 text-brand-dark' : 'border-brand-line group-hover:border-brand-red'}`}>
                      {selectedOS.isReadyForInstallation && <CheckCircle2 size={14} strokeWidth={3} />}
                    </div>
                    <div className="flex flex-col">
                      <span className={`font-mono text-xs uppercase tracking-wider ${selectedOS.isReadyForInstallation ? 'text-emerald-500' : 'text-slate-300'}`}>
                        {selectedOS.isReadyForInstallation ? 'PRONTO PARA INSTALAÇÃO' : 'AGUARDANDO FINALIZAÇÃO'}
                      </span>
                      <span className="text-[8px] text-slate-500 uppercase mt-1">
                        CLIQUE PARA ALTERAR O STATUS DO BANCO
                      </span>
                    </div>
                  </button>
                </div>

                {selectedOS.installationPhoto && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2 h-2 bg-brand-red rotate-45" />
                      <h3 className="font-black text-lg uppercase italic">PRODUTO_INSTALADO</h3>
                    </div>
                    <div className="technical-card p-2 bg-brand-dark flex items-center justify-center overflow-hidden">
                      <img src={selectedOS.installationPhoto} alt="Produto Instalado" className="w-full h-auto object-cover rounded" loading="lazy" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-brand-surface border-t border-brand-border shrink-0 space-y-4">
                {selectedOS.status === 'aberta' && (
                  <button
                    onClick={() => updateOSStatus(selectedOS.id, 'em_andamento')}
                    className="w-full bg-brand-red text-white py-5 font-black uppercase tracking-widest glow-red active:scale-95 transition-all"
                  >
                    INICIAR PROTOCOLO
                  </button>
                )}
                {selectedOS.status === 'em_andamento' && (
                  <div className="flex gap-4">
                    <button
                      onClick={() => updateOSStatus(selectedOS.id, 'pausada')}
                      className="flex-1 bg-brand-surface border border-brand-border text-amber-500 py-5 font-black uppercase tracking-widest active:scale-95 transition-all"
                    >
                      PAUSAR
                    </button>
                    <button
                      onClick={() => setIsPhotoModalOpen(true)}
                      className="flex-[2] bg-emerald-600 text-white py-5 font-black uppercase tracking-widest glow-red active:scale-95 transition-all"
                    >
                      FINALIZAR
                    </button>
                  </div>
                )}
                {selectedOS.status === 'pausada' && (
                  <button
                    onClick={() => updateOSStatus(selectedOS.id, 'em_andamento')}
                    className="w-full bg-brand-red text-white py-5 font-black uppercase tracking-widest glow-red active:scale-95 transition-all"
                  >
                    RETOMAR PROTOCOLO
                  </button>
                )}
                {selectedOS.status === 'concluida' && (
                  <div className="flex gap-4">
                    <button className="flex-1 bg-brand-surface border border-brand-border text-slate-400 py-5 font-black uppercase tracking-widest active:scale-95 transition-all">
                      LOGS
                    </button>
                    <button
                      onClick={() => generateOSPDF(selectedOS)}
                      className="flex-1 bg-brand-red text-white py-5 font-black uppercase tracking-widest glow-red active:scale-95 transition-all"
                    >
                      EXPORTAR PDF
                    </button>
                    <button
                      onClick={() => shareOnWhatsApp(selectedOS)}
                      className="flex-1 bg-emerald-600 text-white py-5 font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Share2 size={18} />
                      WHATSAPP
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="w-full flex items-center justify-center gap-3 text-rose-500 font-black uppercase tracking-widest py-4 border border-rose-500/20 hover:bg-rose-500/5 transition-all"
                >
                  <Trash2 size={18} />
                  DELETAR REGISTRO
                </button>
              </div>
            </motion.div>
          ) : managementView !== 'none' ? (
            <motion.div
              key="management-view"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute inset-0 bg-brand-dark z-30 p-6 space-y-8 overflow-y-auto technical-grid"
            >
              <div className="scanline" />

              {managementView === 'clients' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-5">
                    <button onClick={() => setManagementView('none')} className="p-3 bg-brand-surface border border-brand-border text-white">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight uppercase italic">CLIENTES</h2>
                      <span className="technical-label text-brand-red">BANCO DE DADOS ATIVO</span>
                    </div>
                  </div>

                  <form onSubmit={handleAddClient} className="technical-card p-8 space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1 h-3 bg-brand-red" />
                      <span className="technical-label">NOVO_CADASTRO</span>
                    </div>
                    <MobileInput label="NOME_COMPLETO" value={newClient.name} onChange={v => setNewClient({ ...newClient, name: v })} placeholder="DIGITE O NOME..." />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <MobileInput label="WHATSAPP_ID" value={newClient.phone} onChange={v => setNewClient({ ...newClient, phone: v })} placeholder="(00) 00000-0000" />
                      <MobileInput label="EMAIL_ADDR" value={newClient.email} onChange={v => setNewClient({ ...newClient, email: v })} placeholder="CLIENTE@EMAIL.COM" />
                    </div>
                    <MobileInput label="LOCAL_ADDR" value={newClient.address} onChange={v => setNewClient({ ...newClient, address: v })} placeholder="RUA, NÚMERO, BAIRRO..." />
                    <button
                      type="button"
                      onClick={handleAddClient}
                      disabled={isSubmitting}
                      className="w-full py-5 bg-brand-red text-white font-black uppercase tracking-widest glow-red flex items-center justify-center gap-3"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" /> : 'EXECUTAR CADASTRO'}
                    </button>
                  </form>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2 h-2 bg-brand-red rotate-45" />
                      <h3 className="font-black text-lg uppercase italic">REGISTROS_EXISTENTES</h3>
                    </div>
                    {clients.map(client => (
                      <div key={client.id} className="technical-card p-6 flex items-center justify-between group">
                        <div className="flex items-center gap-5 min-w-0">
                          <div className="w-14 h-14 bg-brand-dark border border-brand-border flex items-center justify-center text-brand-red group-hover:border-brand-red transition-all">
                            <User size={28} strokeWidth={1} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-black text-lg tracking-tight uppercase italic truncate">{client.name}</h4>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="technical-label text-[8px]">{client.phone || 'NO_PHONE'}</span>
                              {client.phone && (
                                <>
                                  <div className="w-1 h-1 bg-brand-line rounded-full" />
                                  <span className="text-[8px] font-mono text-emerald-500 uppercase tracking-widest">VERIFICADO</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {client.phone && (
                            <a
                              href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 bg-brand-dark border border-brand-border text-emerald-500 hover:border-emerald-500 transition-all"
                            >
                              <MessageSquare size={20} />
                            </a>
                          )}
                          {userProfile?.role === 'admin' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClient(client.id);
                              }}
                              className="p-3 text-rose-500 hover:bg-rose-500/10 transition-all"
                            >
                              <Trash2 size={20} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {managementView === 'settings' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-5">
                    <button onClick={() => setManagementView('none')} className="p-3 bg-brand-surface border border-brand-border text-white">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight uppercase italic">CONFIGURAÇÕES</h2>
                      <span className="technical-label text-brand-red">SISTEMA_CORE</span>
                    </div>
                  </div>

                  <div className="technical-card p-8 space-y-8">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-4 bg-brand-red" />
                      <h3 className="font-bold uppercase italic">PERFIL_USUÁRIO</h3>
                    </div>

                    <div className="flex items-center gap-6 p-4 bg-brand-dark border border-brand-line">
                      <div className="w-16 h-16 bg-brand-surface border border-brand-red flex items-center justify-center text-brand-red overflow-hidden">
                        {userProfile?.photoURL ? (
                          <img src={optimizeProfileUrl(userProfile.photoURL, 128)} alt={userProfile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                        ) : (
                          <User size={32} strokeWidth={1} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm technical-label text-brand-red">AUTENTICADO_COMO</p>
                        <p className="font-black text-xl uppercase italic">{userProfile?.name || auth.currentUser?.email}</p>
                        <p className="text-[10px] font-mono text-slate-500 uppercase">{userProfile?.role === 'admin' ? 'ACESSO_TOTAL' : 'ACESSO_RESTRITO'}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-brand-dark border border-brand-line">
                        <div className="flex items-center gap-3">
                          <Bell size={18} className="text-brand-red" />
                          <div>
                            <p className="text-[10px] font-black uppercase italic">NOTIFICAÇÕES_PUSH</p>
                            <p className="text-[7px] technical-label">ALERTAS DE NOVAS ORDENS</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {notificationPermission === 'default' && (
                            <button
                              onClick={requestNotificationPermission}
                              className="px-2 py-1 bg-brand-red text-white text-[7px] font-black uppercase"
                            >
                              ATIVAR
                            </button>
                          )}
                          <button
                            onClick={() => setNotifications(!notifications)}
                            className={`w-10 h-5 border transition-all relative ${notifications ? 'bg-brand-red border-brand-red' : 'bg-brand-dark border-brand-line'}`}
                          >
                            <div className={`absolute top-0.5 w-2.5 h-2.5 transition-all ${notifications ? 'right-0.5 bg-white' : 'left-0.5 bg-slate-600'} rotate-45`} />
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => auth.signOut()}
                        className="w-full py-5 bg-brand-surface border border-rose-500/30 text-rose-500 font-black uppercase tracking-widest hover:bg-rose-500/5 transition-all flex items-center justify-center gap-3"
                      >
                        <LogOut size={20} />
                        ENCERRAR_SESSÃO
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {managementView === 'techs' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-5">
                    <button onClick={() => setManagementView('none')} className="p-3 bg-brand-surface border border-brand-border text-white">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight uppercase italic">TAPECEIROS</h2>
                      <span className="technical-label text-brand-red">EQUIPE_TÉCNICA</span>
                    </div>
                  </div>

                  {['admin', 'gestor'].includes(userProfile?.role || '') && (
                    <form onSubmit={handleRegisterTech} className="technical-card p-8 space-y-6">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-3 bg-brand-red" />
                          <span className="technical-label">REGISTRO_TÉCNICO</span>
                        </div>
                        <div className="flex items-center gap-2 bg-brand-surface p-1 border border-brand-border">
                          <button
                            type="button"
                            onClick={() => setRegType('manual')}
                            className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest transition-all ${regType === 'manual' ? 'bg-brand-red text-white' : 'text-slate-500 hover:text-white'}`}
                          >
                            MANUAL
                          </button>
                          <button
                            type="button"
                            onClick={() => setRegType('google')}
                            className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest transition-all ${regType === 'google' ? 'bg-brand-red text-white' : 'text-slate-500 hover:text-white'}`}
                          >
                            GOOGLE
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <MobileInput label="NOME_TÉCNICO" value={newTech.name} onChange={v => setNewTech({ ...newTech, name: v })} placeholder="NOME DO TAPECEIRO..." />
                        <MobileInput label="EMAIL_ADDR" value={newTech.email} onChange={v => setNewTech({ ...newTech, email: v })} placeholder="EMAIL@EMPRESA.COM" />

                        <div className="space-y-2">
                          <label className="technical-label">NÍVEL_ACESSO</label>
                          <div className="grid grid-cols-2 gap-4">
                            {['tecnico', 'gestor'].map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setNewTech({ ...newTech, role: r as UserRole })}
                                className={`py-3 border font-black uppercase tracking-widest text-[10px] transition-all ${newTech.role === r
                                    ? 'bg-brand-red border-brand-red text-white'
                                    : 'bg-brand-surface border-brand-border text-slate-500'
                                  }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-5 bg-brand-red text-white font-black uppercase tracking-widest glow-red flex items-center justify-center gap-3"
                      >
                        {isSubmitting ? <Loader2 className="animate-spin" /> : `CADASTRAR (${regType.toUpperCase()})`}
                      </button>

                      {regType === 'google' ? (
                        <div className="p-4 bg-brand-surface border border-brand-border space-y-2">
                          <p className="text-[8px] font-mono text-slate-500 uppercase">
                            * O TAPECEIRO DEVERÁ FAZER LOGIN COM ESTE E-MAIL VIA GOOGLE PARA VINCULAR A CONTA.
                          </p>
                          <div className="flex items-center justify-between gap-4">
                            <code className="text-[8px] font-mono text-brand-red truncate">{window.location.origin}</code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(window.location.origin);
                                setAlertMessage({
                                  title: 'LINK_COPIADO',
                                  message: 'O LINK DE ACESSO FOI COPIADO PARA A ÁREA DE TRANSFERÊNCIA.',
                                  type: 'success'
                                });
                              }}
                              className="px-2 py-1 bg-brand-dark border border-brand-border text-[8px] font-black uppercase text-slate-500 hover:text-white"
                            >
                              COPIAR_LINK
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[8px] font-mono text-slate-500 uppercase text-center">
                          * REGISTRO LOCAL PARA CONTROLE INTERNO. SEM VÍNCULO COM CONTA GOOGLE.
                        </p>
                      )}
                    </form>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2 h-2 bg-brand-red rotate-45" />
                      <h3 className="font-black text-lg uppercase italic">COLABORADORES</h3>
                    </div>
                    {techs.map(tech => (
                      <div key={tech.id} className="technical-card p-6 flex items-center justify-between group">
                        <div className="flex items-center gap-5 min-w-0">
                          <div className="w-14 h-14 bg-brand-dark border border-brand-border flex items-center justify-center text-brand-red group-hover:border-brand-red transition-all overflow-hidden">
                            {tech.photoURL ? (
                              <img src={optimizeProfileUrl(tech.photoURL, 64)} alt={tech.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                            ) : (
                              <User size={28} strokeWidth={1} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-black text-lg tracking-tight uppercase italic truncate">{tech.name}</h4>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="technical-label text-[8px]">{tech.email}</span>
                              <div className="w-1 h-1 bg-brand-line rounded-full" />
                              <span className={`text-[8px] font-mono uppercase tracking-widest ${tech.id.startsWith('manual_') ? 'text-amber-500' : 'text-emerald-500'
                                }`}>
                                {tech.id.startsWith('manual_') ? 'MANUAL' : 'GOOGLE_LINK'}
                              </span>
                            </div>
                          </div>
                        </div>
                        {userProfile?.role === 'admin' && tech.id !== user?.uid && (
                          <button
                            onClick={() => handleDeleteTech(tech.id)}
                            className="p-3 text-rose-500 hover:bg-rose-500/10 transition-all"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {managementView === 'services' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-5">
                    <button onClick={() => setManagementView('none')} className="p-3 bg-brand-surface border border-brand-border text-white">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight uppercase italic">SERVIÇOS</h2>
                      <span className="technical-label text-brand-red">CATÁLOGO_OPERACIONAL</span>
                    </div>
                  </div>

                  {['admin', 'gestor'].includes(userProfile?.role || '') && (
                    <form onSubmit={handleAddService} className="technical-card p-8 space-y-6">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-3 bg-brand-red" />
                        <span className="technical-label">NOVO_SERVIÇO</span>
                      </div>
                      <MobileInput
                        label="NOME_SERVIÇO"
                        value={newService.name}
                        onChange={v => setNewService({ ...newService, name: v })}
                        placeholder="EX: REFORMA DE SOFÁ, HIGIENIZAÇÃO..."
                      />
                      <MobileInput
                        label="DESCRIÇÃO_DETALHADA"
                        value={newService.description}
                        onChange={v => setNewService({ ...newService, description: v })}
                        placeholder="DETALHES DO SERVIÇO..."
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-5 bg-brand-red text-white font-black uppercase tracking-widest glow-red flex items-center justify-center gap-3"
                      >
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'REGISTRAR SERVIÇO'}
                      </button>
                    </form>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2 h-2 bg-brand-red rotate-45" />
                      <h3 className="font-black text-lg uppercase italic">SERVIÇOS_DISPONÍVEIS</h3>
                    </div>
                    {services.length > 0 ? (
                      services.map(service => (
                        <div key={service.id} className="technical-card p-6 flex items-center justify-between group">
                          <div className="flex items-center gap-5 min-w-0">
                            <div className="w-12 h-12 bg-brand-dark border border-brand-border flex items-center justify-center text-brand-red group-hover:border-brand-red transition-all">
                              <ClipboardList size={24} strokeWidth={1} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-black text-lg tracking-tight uppercase italic truncate">{service.name}</h4>
                              <p className="technical-label text-[8px] truncate">{service.description || 'SEM DESCRIÇÃO'}</p>
                            </div>
                          </div>
                          {['admin', 'gestor'].includes(userProfile?.role || '') && (
                            <button
                              onClick={() => handleDeleteService(service.id)}
                              className="p-3 text-rose-500 hover:bg-rose-500/10 transition-all"
                            >
                              <Trash2 size={20} />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-12 technical-card border-dashed border-brand-line text-center">
                        <p className="technical-label text-slate-600">NENHUM SERVIÇO CADASTRADO</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {managementView === 'apiKey' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-5">
                    <button onClick={() => setManagementView('none')} className="p-3 bg-brand-surface border border-brand-border text-white">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight uppercase italic">INTELIGÊNCIA ARTIFICIAL</h2>
                      <span className="technical-label text-brand-red">SISTEMA_DE_VOZ</span>
                    </div>
                  </div>

                  <div className="technical-card p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-4 bg-brand-red" />
                        <h3 className="font-bold uppercase italic">CONFIGURAÇÃO DO ASSISTENTE IA</h3>
                      </div>
                    </div>

                    <div className="p-4 bg-brand-red/10 border border-brand-red/20 flex gap-4">
                      <AlertCircle className="text-brand-red shrink-0" size={24} />
                      <p className="text-xs font-mono text-brand-red uppercase leading-relaxed">
                        AVISO: ESTA CHAVE É NECESSÁRIA PARA O FUNCIONAMENTO DO ASSISTENTE DE VOZ E AUTOMAÇÕES. NÃO COMPARTILHE.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="technical-label text-[10px]">PROVEDOR_DE_IA</label>
                      <select
                        value={aiProvider}
                        onChange={(e) => setAiProvider(e.target.value)}
                        className="w-full bg-brand-surface border border-brand-border px-3 py-3 font-mono text-xs text-white outline-none focus:border-brand-red transition-all appearance-none uppercase"
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI (ChatGPT)</option>
                      </select>
                    </div>

                    <MobileInput
                      label="CHAVE_DE_API_DA_IA"
                      value={apiKey}
                      onChange={setApiKey}
                      placeholder="INSIRA SUA CHAVE DA IA AQUI..."
                      type="password"
                    />

                    <button
                      onClick={handleSaveApiKey}
                      disabled={isSubmitting}
                      className="w-full py-5 bg-brand-red text-white font-black uppercase tracking-widest glow-red flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={24} /> : 'VALIDAR E SALVAR CHAVE'}
                    </button>
                  </div>

                  <div className="technical-card p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-4 bg-brand-red" />
                        <h3 className="font-bold uppercase italic">ACESSO_API_EXTERNA</h3>
                      </div>
                      <button
                        onClick={handleGenerateApiKey}
                        className="text-[10px] font-black text-brand-red uppercase tracking-widest hover:underline"
                      >
                        REGERAR_CHAVE
                      </button>
                    </div>

                    <div className="p-4 bg-brand-surface border border-brand-line">
                      <p className="text-[10px] font-mono text-slate-400 uppercase leading-relaxed">
                        USE ESTA CHAVE PARA INTEGRAR COM OUTROS SISTEMAS (ERP, SITE, CRM).
                      </p>
                    </div>

                    <div className="p-5 bg-brand-dark border border-brand-border font-mono text-xs break-all text-brand-red select-all">
                      {userProfile?.api_key || 'CHAVE_NÃO_GERADA'}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-brand-line">
                      <h4 className="technical-label text-[8px]">DOCUMENTAÇÃO_RÁPIDA</h4>
                      <div className="space-y-3">
                        <div className="p-3 bg-brand-dark border border-brand-line">
                          <p className="text-[8px] text-slate-500 mb-1">BASE_URL</p>
                          <p className="text-[10px] font-mono text-white truncate">{window.location.origin}/api/v1</p>
                        </div>
                        <div className="p-3 bg-brand-dark border border-brand-line">
                          <p className="text-[8px] text-slate-500 mb-1">EXEMPLO_CURL</p>
                          <pre className="text-[8px] font-mono text-emerald-500 whitespace-pre-wrap">
                            {`curl -X POST ${window.location.origin}/api/v1/orders \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${userProfile?.api_key || 'SUA_CHAVE'}" \\
  -d '{
    "client_id": "ID_DO_CLIENTE",
    "description": "Reforma de sofá",
    "priority": "alta"
  }'`}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 space-y-6"
            >
              {activeTab === 'dashboard' && (
                <div className="space-y-6 pb-24">
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsModalOpen(true)}
                    className="technical-card p-4 flex items-center gap-4 cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-brand-red rounded-none flex items-center justify-center glow-red relative shrink-0">
                      <Mic size={24} className="text-white" />
                      <div className="absolute -inset-1 border border-brand-red/30 animate-ping" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="technical-label text-brand-red text-[7px]">VOICE COMMAND</span>
                        <div className="w-1 h-1 rounded-full bg-brand-red animate-pulse" />
                      </div>
                      <h3 className="font-black text-lg tracking-tight uppercase italic truncate">ASSISTENTE DE VOZ</h3>
                      <p className="text-slate-500 text-[9px] font-mono uppercase tracking-wider">PROCESSAMENTO EM TEMPO REAL</p>
                    </div>
                    <Wand2 className="text-brand-red opacity-30 group-hover:opacity-100 transition-opacity shrink-0" size={20} />
                  </motion.div>

                  <div className="grid grid-cols-2 gap-3">
                    <MobileStatCard
                      label="ORDENS ABERTAS"
                      value={stats?.open || 0}
                      icon={<Clock size={20} />}
                      trend="+12%"
                    />
                    <MobileStatCard
                      label="EM EXECUÇÃO"
                      value={stats?.inProgress || 0}
                      icon={<AlertCircle size={20} />}
                      trend="ESTÁVEL"
                    />
                    <MobileStatCard
                      label="FINALIZADAS"
                      value={stats?.completed || 0}
                      icon={<CheckCircle2 size={20} />}
                      trend="+5"
                    />
                    <MobileStatCard
                      label="TOTAL DB"
                      value={stats?.total || 0}
                      icon={<ClipboardList size={20} />}
                    />
                  </div>

                  {['admin', 'gestor'].includes(userProfile?.role || '') && (
                    <motion.div
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setManagementView('techs')}
                      className="technical-card p-4 flex items-center gap-4 cursor-pointer group border-brand-red/20 hover:border-brand-red transition-all"
                    >
                      <div className="w-12 h-12 bg-brand-dark border border-brand-border rounded-none flex items-center justify-center text-brand-red group-hover:bg-brand-red group-hover:text-white transition-all shrink-0">
                        <Users size={24} strokeWidth={1} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="technical-label text-brand-red text-[7px]">EQUIPE_TÉCNICA</span>
                          <div className="w-1 h-1 rounded-full bg-brand-red animate-pulse" />
                        </div>
                        <h3 className="font-black text-lg tracking-tight uppercase italic truncate">GERENCIAR TAPECEIROS</h3>
                        <p className="text-slate-500 text-[9px] font-mono uppercase tracking-wider">REGISTRO MANUAL E GOOGLE</p>
                      </div>
                      <ChevronRight className="text-brand-red opacity-30 group-hover:opacity-100 transition-opacity shrink-0" size={20} />
                    </motion.div>
                  )}

                  <div className="technical-card p-5">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <span className="technical-label text-[7px]">DATA ANALYTICS</span>
                        <h3 className="font-black text-base uppercase italic">DISTRIBUIÇÃO DE CARGA</h3>
                      </div>
                      <div className="p-1.5 bg-brand-dark border border-brand-border">
                        <BarChartIcon size={16} className="text-brand-red" />
                      </div>
                    </div>

                    <div className="h-40 relative min-w-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={100}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={8}
                            dataKey="value"
                            stroke="none"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0F0F0F', border: '1px solid #1A1A1A', borderRadius: '0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                            itemStyle={{ color: '#fff', fontFamily: 'JetBrains Mono', fontSize: '9px', textTransform: 'uppercase' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="technical-label text-[7px]">TOTAL</span>
                        <span className="text-xl font-black tracking-tighter">{stats?.total || 0}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mt-4">
                      {pieData.map(item => (
                        <div key={item.name} className="flex flex-col items-center p-1.5 bg-brand-dark border border-brand-border">
                          <div className="w-full h-[1.5px] mb-1.5" style={{ backgroundColor: item.fill }} />
                          <span className="technical-label text-[6px] truncate w-full text-center uppercase opacity-70">{item.name}</span>
                          <span className="technical-value text-[10px] font-black">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-brand-red" />
                        <h3 className="font-black text-lg uppercase italic">TERMINAL RECENTE</h3>
                      </div>
                      <button onClick={() => setActiveTab('orders')} className="technical-label text-brand-red hover:underline">VER LOG COMPLETO</button>
                    </div>
                    <div className="space-y-4">
                      {orders.slice(0, 3).map(os => (
                        <MobileOSCard
                          key={os.id}
                          os={os}
                          clientName={clients.find(c => c.id === os.client_id)?.name}
                          whatsapp={clients.find(c => c.id === os.client_id)?.phone}
                          onClick={() => setSelectedOS(os)}
                          onDelete={(e) => {
                            e.stopPropagation();
                            setSelectedOS(os);
                            setIsDeleteConfirmOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'orders' && (
                <div className="space-y-4 pb-24">
                  <div className="flex items-center justify-between sticky top-0 bg-brand-dark/80 backdrop-blur-md py-3 z-10 border-b border-brand-border px-1">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1">
                      {['TODAS', 'ABERTAS', 'EM CURSO', 'CONCLUÍDAS'].map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setOrderFilter(filter as any)}
                          className={`px-3 py-1.5 font-black text-[9px] uppercase tracking-tighter transition-all whitespace-nowrap ${orderFilter === filter
                              ? 'bg-brand-red text-white glow-red'
                              : 'bg-brand-surface border border-brand-border text-slate-500'
                            }`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                    <button className="p-2 bg-brand-surface border border-brand-border text-brand-red ml-2 shrink-0">
                      <Filter size={16} />
                    </button>
                  </div>
                  <div className="space-y-3 px-1">
                    {filteredOrders.length > 0 ? (
                      filteredOrders.map(os => (
                        <MobileOSCard
                          key={os.id}
                          os={os}
                          clientName={clients.find(c => c.id === os.client_id)?.name}
                          whatsapp={clients.find(c => c.id === os.client_id)?.phone}
                          onClick={() => setSelectedOS(os)}
                          onDelete={(e) => {
                            e.stopPropagation();
                            setSelectedOS(os);
                            setIsDeleteConfirmOpen(true);
                          }}
                        />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-600 space-y-4">
                        <div className="w-16 h-16 bg-brand-surface border border-brand-line flex items-center justify-center">
                          <SearchX size={32} strokeWidth={1} />
                        </div>
                        <div className="text-center">
                          <p className="font-black text-lg uppercase italic">NENHUM_REGISTRO</p>
                          <p className="technical-label text-[7px]">BANCO DE DADOS VAZIO</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'agenda' && (
                <div className="space-y-6 pb-24 px-1">
                  <div className="flex flex-col space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border pb-4">
                      <div>
                        <h3 className="font-black text-2xl sm:text-3xl uppercase italic tracking-tighter leading-none text-white">AGENDA_OPERACIONAL</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse" />
                          <span className="technical-label text-brand-red text-[7px] sm:text-[8px] uppercase tracking-widest">CRONOGRAMA_ATIVO</span>
                        </div>
                      </div>
                      <div className="flex gap-1 p-1 bg-brand-dark border border-brand-border self-start sm:self-auto">
                        {(['DIA', 'SEMANA', 'MÊS'] as const).map(view => (
                          <button
                            key={view}
                            onClick={() => setAgendaView(view)}
                            className={`px-4 py-2 text-[7px] sm:text-[8px] font-black uppercase tracking-tighter transition-all ${agendaView === view ? 'bg-brand-red text-white glow-red' : 'text-slate-500 hover:text-slate-300'
                              }`}
                          >
                            {view}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-brand-surface border border-brand-border p-4 shadow-lg">
                      <button
                        onClick={() => navigateAgenda('prev')}
                        className="p-2 hover:bg-brand-dark text-brand-red transition-colors"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <div className="flex flex-col items-center">
                        <span className="font-black text-sm uppercase italic tracking-widest">
                          {agendaView === 'DIA'
                            ? format(selectedAgendaDate, "EEEE, dd 'de' MMMM", { locale: ptBR }).toUpperCase()
                            : format(selectedAgendaDate, "MMMM 'de' yyyy", { locale: ptBR }).toUpperCase()
                          }
                        </span>
                        <button
                          onClick={() => setSelectedAgendaDate(new Date())}
                          className="technical-label text-[7px] text-brand-red hover:underline mt-1"
                        >
                          IR_PARA_HOJE
                        </button>
                      </div>
                      <button
                        onClick={() => navigateAgenda('next')}
                        className="p-2 hover:bg-brand-dark text-brand-red transition-colors"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                      <div className="flex items-center gap-1.5 mr-2 shrink-0">
                        <Filter size={10} className="text-slate-500" />
                        <span className="technical-label text-[7px] text-slate-500 uppercase tracking-widest">FILTRAR_PRIORIDADE:</span>
                      </div>
                      {(['todas', 'alta', 'media', 'baixa'] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => setAgendaPriorityFilter(p)}
                          className={`px-3 py-1.5 text-[7px] font-black uppercase tracking-tighter border transition-all shrink-0 ${agendaPriorityFilter === p
                              ? 'bg-brand-red border-brand-red text-white glow-red'
                              : 'bg-brand-dark border-brand-border text-slate-500 hover:border-brand-red/50'
                            }`}
                        >
                          {p === 'todas' ? 'TODAS' : p === 'alta' ? 'ALTA' : p === 'media' ? 'MÉDIA' : 'BAIXA'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {agendaView === 'DIA' && (
                    <div className="space-y-6">
                      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {weekDays.map(date => {
                          const isSelected = isSameDay(date, selectedAgendaDate);
                          const dayName = format(date, 'eee', { locale: ptBR }).toUpperCase();
                          const dayNumber = format(date, 'dd');

                          return (
                            <button
                              key={date.toISOString()}
                              onClick={() => setSelectedAgendaDate(date)}
                              className={`flex flex-col items-center justify-center min-w-[56px] h-20 border transition-all ${isSelected
                                  ? 'bg-brand-red border-brand-red text-white glow-red'
                                  : 'bg-brand-surface border-brand-border text-slate-500 hover:border-brand-red/50'
                                }`}
                            >
                              <span className="text-[7px] font-black uppercase tracking-tighter mb-1 opacity-70">{dayName}</span>
                              <span className="text-xl font-black font-mono tracking-tighter">{dayNumber}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="relative pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-brand-line">
                        {agendaOrders.length > 0 ? (
                          agendaOrders.map((os, idx) => (
                            <div key={os.id} className="relative">
                              <div className={`absolute -left-[25px] top-1.5 w-2.5 h-2.5 ${idx === 0 ? 'bg-brand-red' : 'bg-brand-surface border border-brand-line'} rotate-45 z-10`} />
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Clock size={10} className="text-brand-red" />
                                  <span className="technical-label text-brand-red text-[8px]">
                                    {os.deadline ? format(new Date(os.deadline), 'HH:mm') : 'HORÁRIO_N/A'}
                                  </span>
                                </div>
                                <MobileOSCard
                                  os={os}
                                  clientName={clients.find(c => c.id === os.client_id)?.name}
                                  whatsapp={clients.find(c => c.id === os.client_id)?.phone}
                                  onClick={() => setSelectedOS(os)}
                                  onDelete={(e) => {
                                    e.stopPropagation();
                                    setSelectedOS(os);
                                    setIsDeleteConfirmOpen(true);
                                  }}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="relative">
                            <div className={`absolute -left-[25px] top-1.5 w-2.5 h-2.5 bg-brand-surface border border-brand-line rotate-45 z-10`} />
                            <div className="p-10 technical-card border-dashed border-brand-line text-center">
                              <p className="technical-label text-[8px] text-slate-600">NENHUM_SERVIÇO_AGENDADO</p>
                              <p className="text-[7px] font-mono text-slate-700 mt-2 uppercase">SLOT_LIVRE_PARA_NOVAS_ORDENS</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {agendaView === 'SEMANA' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => (
                          <div key={d} className="text-center technical-label text-[7px] text-slate-500 py-2">{d}</div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        {weekDays.map(date => {
                          const dayOrders = getOrdersForDate(date);
                          const isToday = isSameDay(date, new Date());
                          return (
                            <div
                              key={date.toISOString()}
                              className={`technical-card p-4 border-l-2 ${isToday ? 'border-l-brand-red bg-brand-red/5' : 'border-l-brand-border'}`}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-black italic ${isToday ? 'text-brand-red' : 'text-white'}`}>
                                    {format(date, 'dd')}
                                  </span>
                                  <span className="technical-label text-[8px] uppercase">{format(date, 'EEEE', { locale: ptBR })}</span>
                                </div>
                                <span className="technical-label text-[7px] text-slate-500">{dayOrders.length} SERVIÇOS</span>
                              </div>
                              <div className="space-y-2">
                                {dayOrders.length > 0 ? (
                                  dayOrders.map(os => (
                                    <div
                                      key={os.id}
                                      onClick={() => setSelectedOS(os)}
                                      className="flex items-center justify-between p-2 bg-brand-dark border border-brand-border hover:border-brand-red transition-colors cursor-pointer"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-1 h-1 rotate-45 ${os.priority === 'alta' ? 'bg-brand-red' : 'bg-amber-500'}`} />
                                        <span className="text-[9px] font-black uppercase italic truncate">
                                          {clients.find(c => c.id === os.client_id)?.name || 'CLIENTE'}
                                        </span>
                                      </div>
                                      <span className="technical-label text-[7px] text-brand-red shrink-0">
                                        {os.deadline ? format(new Date(os.deadline), 'HH:mm') : '--:--'}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="py-2 text-center border border-dashed border-brand-line">
                                    <span className="technical-label text-[6px] text-slate-700 uppercase">SEM_AGENDAMENTOS</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {agendaView === 'MÊS' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-7 gap-px bg-brand-border/20 border border-brand-border/20">
                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                          <div key={i} className="text-center technical-label text-[9px] font-black text-slate-400 py-3 bg-brand-dark/50 uppercase tracking-widest border-b border-brand-border/30">{d}</div>
                        ))}
                        {monthDays.map((date, i) => {
                          const dayOrders = getOrdersForDate(date);
                          const isCurrentMonth = isSameMonth(date, selectedAgendaDate);
                          const isToday = isSameDay(date, new Date());
                          const isSelected = isSameDay(date, selectedAgendaDate);

                          return (
                            <button
                              key={i}
                              onClick={() => {
                                setSelectedAgendaDate(date);
                                setAgendaView('DIA');
                              }}
                              className={`aspect-square flex flex-col items-center justify-center transition-all relative group ${isSelected ? 'bg-brand-red text-white z-10 glow-red' :
                                  isToday ? 'bg-brand-red/10 text-brand-red' :
                                    isCurrentMonth ? 'bg-brand-surface text-slate-300' :
                                      'bg-brand-dark text-slate-700'
                                }`}
                            >
                              <span className={`text-xs font-black italic ${isSelected ? 'text-white' : isToday ? 'text-brand-red' : isCurrentMonth ? 'text-slate-300' : 'text-slate-700'}`}>
                                {format(date, 'd')}
                              </span>
                              {dayOrders.length > 0 && (
                                <div className="absolute bottom-1.5 flex gap-0.5">
                                  {dayOrders.slice(0, 3).map((os, idx) => (
                                    <div
                                      key={idx}
                                      className={`w-1 h-1 rotate-45 ${os.priority === 'alta' ? 'bg-brand-red shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-amber-500'}`}
                                    />
                                  ))}
                                  {dayOrders.length > 3 && <div className="w-1 h-1 rounded-full bg-white/50" />}
                                </div>
                              )}
                              {/* Hover effect */}
                              {!isSelected && (
                                <div className="absolute inset-0 border border-brand-red opacity-0 group-hover:opacity-30 transition-opacity" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="p-4 bg-brand-surface border border-brand-border space-y-4 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-brand-red/5 -mr-8 -mt-8 rotate-45" />
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-1 h-3 bg-brand-red" />
                          <h4 className="technical-label text-brand-red text-[9px] font-black uppercase tracking-widest">RESUMO_DO_DIA</h4>
                        </div>
                        {getOrdersForDate(selectedAgendaDate).length > 0 ? (
                          <div className="space-y-2">
                            {getOrdersForDate(selectedAgendaDate).map(os => (
                              <div key={os.id} className="flex items-center justify-between text-[10px]">
                                <span className="font-black italic uppercase truncate max-w-[150px]">
                                  {clients.find(c => c.id === os.client_id)?.name}
                                </span>
                                <span className="technical-label text-brand-red">
                                  {os.deadline ? format(new Date(os.deadline), 'HH:mm') : '--:--'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="technical-label text-slate-600 text-[7px] italic">NENHUMA_ORDEM_PARA_ESTA_DATA</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="space-y-8 pb-24">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="relative">
                      <div className="w-24 h-24 bg-brand-surface border-2 border-brand-red flex items-center justify-center text-brand-red glow-red overflow-hidden">
                        {userProfile?.photoURL ? (
                          <img src={optimizeProfileUrl(userProfile.photoURL, 192)} alt={userProfile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                        ) : (
                          <User size={48} strokeWidth={1} />
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-brand-red text-white flex items-center justify-center border-2 border-brand-dark">
                        <div className="w-3 h-3 bg-white rotate-45" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-2xl font-black tracking-tight uppercase italic">{userProfile?.name || 'USUÁRIO_DESCONHECIDO'}</h2>
                      <p className="technical-label text-brand-red text-[8px] mt-0.5">{userProfile?.role?.toUpperCase() || 'ACESSO_RESTRITO'} • ID #{user?.uid.slice(0, 4)}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-1.5 h-1.5 bg-brand-red rotate-45" />
                      <h3 className="font-black text-base uppercase italic">GERENCIAMENTO_SISTEMA</h3>
                    </div>
                    <div className="technical-card overflow-hidden">
                      <ProfileItem icon={<Briefcase size={18} />} label="CLIENTES" onClick={() => setManagementView('clients')} />
                      <ProfileItem icon={<Users size={18} />} label="TAPECEIROS" onClick={() => setManagementView('techs')} />
                      <ProfileItem icon={<ClipboardList size={18} />} label="SERVIÇOS" onClick={() => setManagementView('services')} />
                      <ProfileItem icon={<Key size={18} />} label="CHAVE_API" onClick={() => setManagementView('apiKey')} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-1.5 h-1.5 bg-brand-red rotate-45" />
                      <h3 className="font-black text-base uppercase italic">PREFERÊNCIAS_CORE</h3>
                    </div>
                    <div className="technical-card overflow-hidden">
                      <ProfileItem icon={<History size={18} />} label="LOGS_ATIVIDADE" />
                      <ProfileItem icon={<Settings size={18} />} label="CONFIG_SISTEMA" onClick={() => setManagementView('settings')} />
                      <ProfileItem icon={<Bell size={18} />} label="NOTIFICAÇÕES" onClick={() => setManagementView('settings')} />
                    </div>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full py-4 bg-brand-surface border border-rose-500/30 text-rose-500 font-black uppercase tracking-widest hover:bg-rose-500/5 transition-all flex items-center justify-center gap-3 text-[10px]"
                  >
                    <LogOut size={18} /> ENCERRAR_SESSÃO
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-brand-surface border-t border-brand-border px-4 py-2 flex items-center justify-between shrink-0 z-20 relative">
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-brand-red/20" />

        <BottomNavItem
          active={activeTab === 'dashboard'}
          onClick={() => { setActiveTab('dashboard'); setManagementView('none'); setSelectedOS(null); }}
          icon={<LayoutDashboard size={20} />}
          label="DASHBOARD"
        />
        <BottomNavItem
          active={activeTab === 'orders'}
          onClick={() => { setActiveTab('orders'); setManagementView('none'); setSelectedOS(null); }}
          icon={<ClipboardList size={20} />}
          label="TERMINAL"
        />
        <BottomNavItem
          active={activeTab === 'agenda'}
          onClick={() => { setActiveTab('agenda'); setManagementView('none'); setSelectedOS(null); }}
          icon={<CalendarIcon size={20} />}
          label="AGENDA"
        />
        <BottomNavItem
          active={activeTab === 'profile'}
          onClick={() => { setActiveTab('profile'); setManagementView('none'); setSelectedOS(null); }}
          icon={<User size={20} />}
          label="SISTEMA"
        />
      </nav>

      {/* Floating Action Button */}
      {!selectedOS && managementView === 'none' && activeTab !== 'profile' && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsModalOpen(true)}
          className="fixed right-6 bottom-28 w-16 h-16 bg-brand-red rounded-2xl flex items-center justify-center text-white shadow-[0_0_30px_rgba(225,29,72,0.4)] z-40"
        >
          <Plus size={32} />
        </motion.button>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen && (
          <div className="fixed inset-0 bg-brand-dark/95 backdrop-blur-xl z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="technical-card w-full max-w-md overflow-hidden"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-4 bg-brand-red" />
                  <h2 className="text-2xl font-black uppercase italic tracking-tight">CONFIRMAR_EXCLUSÃO</h2>
                </div>

                <div className="p-4 bg-brand-surface border border-brand-line">
                  <p className="text-[10px] font-mono text-slate-400 uppercase leading-relaxed">
                    ATENÇÃO: ESTA AÇÃO É IRREVERSÍVEL. TODOS OS DADOS DESTA ORDEM DE SERVIÇO SERÃO REMOVIDOS PERMANENTEMENTE DO SISTEMA.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setIsDeleteConfirmOpen(false)}
                    className="py-5 bg-brand-surface border border-brand-border text-slate-400 font-black uppercase tracking-widest hover:border-brand-red hover:text-white transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={() => selectedOS && handleDeleteOS(selectedOS.id)}
                    className="py-5 bg-rose-600 text-white font-black uppercase tracking-widest glow-red"
                  >
                    DELETAR_AGORA
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Photo Capture Modal */}
      <AnimatePresence>
        {isPhotoModalOpen && (
          <div className="fixed inset-0 bg-brand-dark/95 backdrop-blur-xl z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="technical-card w-full max-w-lg overflow-hidden"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-4 bg-brand-red" />
                    <h2 className="text-2xl font-black uppercase italic tracking-tight">VALIDAÇÃO_FINAL</h2>
                  </div>
                  <button onClick={() => setIsPhotoModalOpen(false)} className="p-3 bg-brand-surface border border-brand-border text-white hover:border-brand-red transition-all">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-4 bg-brand-surface border border-brand-line">
                  <p className="text-[10px] font-mono text-slate-400 uppercase leading-relaxed">
                    INSTRUÇÃO: ANEXE UMA FOTO DO PRODUTO INSTALADO PARA CONFIRMAÇÃO DE ENTREGA E ENCERRAMENTO DO PROTOCOLO.
                  </p>
                </div>

                {photoError && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/30 flex items-center gap-3">
                    <AlertCircle size={16} className="text-rose-500" />
                    <span className="text-[10px] font-bold text-rose-500 uppercase">{photoError}</span>
                  </div>
                )}

                <div className="bg-brand-dark border border-brand-red/30 relative group min-h-[300px] flex flex-col items-center justify-center p-4">
                  <div className="absolute top-2 left-2 technical-label text-[8px] opacity-50">CAMPO_FOTO</div>

                  {capturedPhoto ? (
                    <div className="relative w-full h-full">
                      <img src={capturedPhoto} alt="Preview" className="w-full h-64 object-cover rounded border border-brand-line" loading="lazy" />
                      <button
                        onClick={() => setCapturedPhoto(null)}
                        className="absolute top-2 right-2 p-2 bg-brand-red text-white rounded-full shadow-lg"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 rounded-full bg-brand-surface border border-brand-line flex items-center justify-center text-brand-red hover:bg-brand-red hover:text-white transition-all"
                      >
                        <Camera size={32} />
                      </button>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">CLIQUE PARA CAPTURAR OU ANEXAR</span>
                    </div>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />

                  <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-brand-red/30" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setIsPhotoModalOpen(false)}
                    className="py-5 bg-brand-surface border border-brand-border text-slate-400 font-black uppercase tracking-widest hover:border-brand-red hover:text-white transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={handleFinishOS}
                    disabled={isFinalizing}
                    className="py-5 bg-brand-red text-white font-black uppercase tracking-widest glow-red disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isFinalizing ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        PROCESSANDO...
                      </>
                    ) : (
                      'FINALIZAR_OS'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New OS Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-brand-dark/95 backdrop-blur-xl z-50 flex items-center justify-center p-3">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="technical-card w-full max-w-lg overflow-hidden max-h-[95vh] flex flex-col"
            >
              <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
                <div className="flex items-center justify-between sticky top-0 bg-brand-surface/95 backdrop-blur-md z-10 py-2 -mx-6 px-6 border-b border-brand-border">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-3 bg-brand-red" />
                    <h2 className="text-xl font-black uppercase italic tracking-tight">NOVA_ORDEM</h2>
                    {isDraftRecovered && (
                      <span className="technical-label text-[6px] text-emerald-500 animate-pulse ml-2">RASCUNHO_RECUPERADO</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="p-2 bg-brand-dark border border-brand-border text-slate-500 hover:text-brand-red transition-all"
                      title="LIMPAR RASCUNHO"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 bg-brand-dark border border-brand-border text-white hover:border-brand-red transition-all">
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <VoiceAssistant
                  clients={clients.map(c => ({ id: c.id, name: c.name }))}
                  onDataExtracted={handleVoiceData}
                />

                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-5">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center px-1">
                        <label className="technical-label text-[8px]">CLIENTE_ID</label>
                        <button
                          type="button"
                          onClick={() => { setIsModalOpen(false); setManagementView('clients'); }}
                          className="text-[7px] font-black text-brand-red uppercase tracking-widest hover:underline"
                        >
                          + NOVO
                        </button>
                      </div>
                      <select
                        value={formData.client_id}
                        onChange={e => setFormData({ ...formData, client_id: e.target.value })}
                        className="w-full bg-brand-surface border border-brand-border px-3 py-3 font-mono text-[10px] text-white outline-none focus:border-brand-red transition-all appearance-none uppercase"
                        required
                      >
                        <option value="">SELECIONAR_CLIENTE</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <MobileInput
                      label="MODELO_CAMINHÃO"
                      value={formData.truckModel || ''}
                      onChange={v => setFormData({ ...formData, truckModel: v })}
                      placeholder="EX: SCANIA FH"
                    />
                    <MobileInput
                      label="PLACA_CAMINHÃO"
                      value={formData.truckPlate || ''}
                      onChange={v => setFormData({ ...formData, truckPlate: v.toUpperCase() })}
                      placeholder="EX: ABC-1234"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <MobileInput
                      label="TIPO_MÓVEL"
                      value={formData.furnitureType || ''}
                      onChange={v => setFormData({ ...formData, furnitureType: v })}
                      placeholder="EX: SOFÁ_CAM_CAMINHÃO"
                    />
                    <MobileInput
                      label="ESPEC_TECIDO"
                      value={formData.fabric || ''}
                      onChange={v => setFormData({ ...formData, fabric: v })}
                      placeholder="EX: VELUDO_PRETO_DIAMANTE"
                    />
                  </div>

                  <MobileInput
                    label="DESCRIÇÃO_TÉCNICA"
                    value={formData.description}
                    onChange={v => setFormData({ ...formData, description: v })}
                    placeholder="DETALHAMENTO_DO_SERVIÇO..."
                    multiline
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <MobileInput
                      label="VALOR_TOTAL (R$)"
                      value={formData.value || ''}
                      onChange={v => setFormData({ ...formData, value: v })}
                      placeholder="0,00"
                    />
                    <MobileInput
                      label="FORMA_PAGAMENTO"
                      value={formData.paymentMethod || ''}
                      onChange={v => setFormData({ ...formData, paymentMethod: v })}
                      placeholder="EX: PIX / CARTÃO"
                    />
                  </div>

                  <MobileInput
                    label="OBSERVAÇÕES_ADICIONAIS"
                    value={formData.notes || ''}
                    onChange={v => setFormData({ ...formData, notes: v })}
                    placeholder="NOTAS_INTERNAS_OU_EXTERNAS..."
                    multiline
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="technical-label px-1 text-[8px]">PRIORIDADE_LVL</label>
                      <select
                        value={formData.priority}
                        onChange={e => setFormData({ ...formData, priority: e.target.value as OSPriority })}
                        className="w-full bg-brand-surface border border-brand-border px-3 py-3 font-mono text-[10px] text-white outline-none focus:border-brand-red transition-all appearance-none uppercase"
                      >
                        <option value="baixa">BAIXA</option>
                        <option value="media">MÉDIA</option>
                        <option value="alta">ALTA</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="technical-label px-1 text-[8px]">DATA_ENTREGA (DEADLINE)</label>
                      <input
                        type="date"
                        value={formData.deadline}
                        onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                        className="w-full bg-brand-surface border border-brand-border px-3 py-3 font-mono text-[10px] text-white outline-none focus:border-brand-red transition-all appearance-none uppercase"
                      />
                    </div>
                  </div>
                </div>

                <button
                  disabled={isSubmitting}
                  type="submit"
                  className="w-full py-4 bg-brand-red text-white font-black uppercase tracking-widest glow-red flex items-center justify-center gap-3 text-xs"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : 'INICIALIZAR_ORDEM'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {confirmAction && (
          <div className="fixed inset-0 bg-brand-dark/90 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="technical-card w-full max-w-sm p-8 space-y-6 border-brand-red/50"
            >
              <div className="flex items-center gap-3 text-brand-red">
                <AlertTriangle size={24} />
                <h3 className="text-xl font-black uppercase italic tracking-tight">{confirmAction.title}</h3>
              </div>
              <p className="text-slate-400 font-mono text-xs uppercase leading-relaxed">
                {confirmAction.message}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="py-4 bg-brand-surface border border-brand-border text-slate-500 font-black uppercase text-[10px] tracking-widest"
                >
                  CANCELAR
                </button>
                <button
                  onClick={confirmAction.onConfirm}
                  className="py-4 bg-brand-red text-white font-black uppercase text-[10px] tracking-widest glow-red"
                >
                  CONFIRMAR
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {alertMessage && (
          <div className="fixed inset-0 bg-brand-dark/90 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`technical-card w-full max-w-sm p-8 space-y-6 ${alertMessage.type === 'success' ? 'border-emerald-500/50' : 'border-rose-500/50'}`}
            >
              <div className={`flex items-center gap-3 ${alertMessage.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                {alertMessage.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                <h3 className="text-xl font-black uppercase italic tracking-tight">{alertMessage.title}</h3>
              </div>
              <p className="text-slate-400 font-mono text-xs uppercase leading-relaxed">
                {alertMessage.message}
              </p>
              <button
                onClick={() => setAlertMessage(null)}
                className={`w-full py-4 font-black uppercase text-[10px] tracking-widest ${alertMessage.type === 'success' ? 'bg-emerald-500 text-white glow-emerald' : 'bg-rose-500 text-white glow-red'
                  }`}
              >
                ENTENDIDO
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BottomNavItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 relative group flex-1">
      <div className={`p-2.5 rounded-none transition-all duration-300 border ${active ? 'bg-brand-red border-brand-red text-white glow-red' : 'bg-transparent border-transparent text-slate-600 hover:text-slate-400'}`}>
        {icon}
      </div>
      <span className={`technical-label text-[7px] font-black tracking-tighter transition-colors ${active ? 'text-brand-red' : 'text-slate-700'}`}>
        {label}
      </span>
      {active && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute -top-2 w-8 h-[2px] bg-brand-red left-1/2 -translate-x-1/2"
        />
      )}
    </button>
  );
}

function MobileStatCard({ label, value, icon, trend }: { label: string, value: number, icon: React.ReactNode, trend?: string }) {
  return (
    <div className="technical-card p-4 group">
      <div className="flex justify-between items-start mb-3">
        <div className="p-1.5 bg-brand-dark border border-brand-border text-brand-red">
          {React.cloneElement(icon as React.ReactElement, { size: 16 })}
        </div>
        {trend && (
          <span className="font-mono text-[7px] text-emerald-500 bg-emerald-500/10 px-1 py-0.5 border border-emerald-500/20">
            {trend}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <span className="technical-label text-[7px] mb-0.5 uppercase">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black tracking-tighter font-mono">
            {value.toString().padStart(2, '0')}
          </span>
          <div className="w-1 h-3 bg-brand-red/20 relative overflow-hidden">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: '100%' }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute bottom-0 left-0 w-full bg-brand-red"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const getDynamicPriority = (os: ServiceOrder): OSPriority => {
  if (!os.deadline || os.status === 'concluida') return os.priority;

  const now = new Date();
  const deadline = new Date(os.deadline);

  // Reset hours to compare dates only
  now.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);

  const diffTime = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let calculatedPriority: OSPriority = 'baixa';
  if (diffDays < 3) calculatedPriority = 'alta';
  else if (diffDays < 7) calculatedPriority = 'media';
  else calculatedPriority = 'baixa';

  const priorityLevels: Record<OSPriority, number> = { 'baixa': 0, 'media': 1, 'alta': 2 };
  if (priorityLevels[calculatedPriority] > priorityLevels[os.priority]) {
    return calculatedPriority;
  }
  return os.priority;
};

function MobileOSCard({ os, onClick, onDelete, clientName, whatsapp }: { os: ServiceOrder, onClick: () => void, onDelete: (e: React.MouseEvent) => void, clientName?: string, whatsapp?: string, key?: React.Key }) {
  const dynamicPriority = getDynamicPriority(os);
  const statusColors = {
    concluida: 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5',
    em_andamento: 'border-amber-500/30 text-amber-500 bg-amber-500/5',
    aberta: 'border-brand-red/30 text-brand-red bg-brand-red/5',
    pausada: 'border-slate-500/30 text-slate-500 bg-slate-500/5'
  };

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full technical-card p-4 text-left hover:border-brand-line transition-all group relative cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="px-1.5 py-0.5 bg-brand-dark border border-brand-border">
              <span className="technical-label text-brand-red text-[7px]">OS-{os.number.toString().padStart(4, '0')}</span>
            </div>
            <div className={`px-1.5 py-0.5 border text-[7px] font-mono uppercase ${statusColors[os.status as keyof typeof statusColors]}`}>
              {os.status.replace('_', ' ')}
            </div>
          </div>
          <h4 className="font-black text-base tracking-tight uppercase italic truncate pr-2">
            {clientName || 'CLIENTE_DESCONHECIDO'}
          </h4>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onDelete}
            className="p-1.5 bg-brand-dark border border-brand-border text-slate-700 hover:text-rose-500 hover:border-rose-500 transition-all"
          >
            <Trash2 size={14} />
          </button>
          <div className="p-1.5 bg-brand-dark border border-brand-border text-slate-700 group-hover:text-brand-red group-hover:border-brand-red transition-all">
            <ChevronRight size={16} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-brand-line">
        <div className="flex flex-col">
          <span className="technical-label text-[6px] mb-0.5 uppercase opacity-50">TIMESTAMP_IN</span>
          <span className="technical-value text-[10px]">{new Date(os.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="technical-label text-[6px] mb-0.5 uppercase opacity-50">PRIORITY_LVL</span>
          <div className="flex items-center gap-1.5">
            <div className={`w-1 h-1 rounded-none rotate-45 ${dynamicPriority === 'alta' ? 'bg-brand-red glow-red' : dynamicPriority === 'media' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span className="technical-value text-[10px] uppercase italic flex items-center gap-1">
              {dynamicPriority}
              {dynamicPriority !== os.priority && <Clock size={7} className="text-brand-red animate-pulse" />}
            </span>
          </div>
        </div>
      </div>

      {os.deadline && (
        <div className="mt-3 pt-3 border-t border-brand-line flex items-center justify-between">
          <span className="technical-label text-[6px] uppercase opacity-50">DEADLINE_DELIVERY</span>
          <span className="text-[9px] font-black text-brand-red uppercase italic">
            {new Date(os.deadline).toLocaleDateString('pt-BR')}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function MobileInput({ label, value, onChange, placeholder, multiline = false, type = 'text' }: { label: string, value: string, onChange: (v: string) => void, placeholder: string, multiline?: boolean, type?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="technical-label ml-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 font-medium text-slate-100 outline-none focus:border-red-500/50 focus:ring-1 ring-red-500/20 placeholder:text-slate-600 transition-all resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 font-medium text-slate-100 outline-none focus:border-red-500/50 focus:ring-1 ring-red-500/20 placeholder:text-slate-600 transition-all"
        />
      )}
    </div>
  );
}

function ProfileItem({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 last:border-none text-left group">
      <div className="flex items-center gap-4 text-slate-300 min-w-0">
        <div className="text-slate-500 group-hover:text-red-500 transition-colors shrink-0">{icon}</div>
        <span className="font-bold text-sm truncate uppercase tracking-tight">{label}</span>
      </div>
      <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 ml-2" />
    </button>
  );
}

function PriorityBadge({ priority, isEscalated }: { priority: string, isEscalated?: boolean }) {
  const styles: Record<string, string> = {
    'alta': 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
    'media': 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    'baixa': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  };

  return (
    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${styles[priority] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
      {priority}
      {isEscalated && <Clock size={10} className="animate-pulse" />}
    </span>
  );
}
