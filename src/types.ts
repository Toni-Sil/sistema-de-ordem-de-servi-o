export type OSStatus = 'aberta' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada' | 'reagendada';
export type OSPriority = 'baixa' | 'media' | 'alta';
export type UserRole = 'admin' | 'gestor' | 'tecnico';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  photoURL?: string;
  api_key?: string;
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
}

export interface ChecklistItem {
  id: string;
  description: string;
  completed: boolean;
}

export interface ServiceOrder {
  id: string;
  number: number;
  description: string;
  priority: OSPriority;
  status: OSStatus;
  client_id: string;
  service_id?: string;
  assigned_to?: string;
  scheduled_at?: string;
  deadline?: string;
  created_at: string;
  furnitureType?: string;
  fabric?: string;
  value?: string;
  paymentMethod?: string;
  notes?: string;
  signature?: string;
  installationPhoto?: string;
  isReadyForInstallation?: boolean;
  checklist?: ChecklistItem[];
  truckPlate?: string;
  truckModel?: string;
}

export interface DashboardStats {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
}
