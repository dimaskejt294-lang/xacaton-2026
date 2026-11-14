export type LessonType = 'group' | 'masterclass' | 'individual' | 'birthday';
export type BookingStatus = 'booked' | 'attended' | 'missed' | 'canceled';
export type PaymentMethod = 'yookassa' | 'cash' | 'transfer';
export type PaymentStatus = 'pending' | 'succeeded' | 'canceled';

export interface WorkshopSettings {
  free_cancel_hours: number;
  charge_on_miss: number;
  charge_on_late_cancel: number;
  show_hero_age?: number;
  hero_age_text?: string;
  show_hero_duration?: number;
  hero_duration_text?: string;
  show_hero_groups?: number;
  hero_groups_text?: string;
  show_hero_free_cancel?: number;
}

export interface Tariff {
  id: number;
  title: string;
  lessons_count: number;
  price: number;
  validity_days: number;
  is_active?: number;
}

export interface PublicLesson {
  id: number;
  title: string;
  lesson_type: LessonType;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  single_price: number;
  description: string | null;
  is_canceled: number;
  booked_count: number;
  waitlist_count: number;
  free_spots: number;
}

export interface ChildProfile {
  id: number;
  family_id: number;
  name: string;
  age: number;
  notes: string | null;
}

export interface SubscriptionItem {
  id: number;
  title: string;
  total_lessons: number;
  remaining_lessons: number;
  expires_at: string;
  created_at: string;
}

export interface ParentBooking {
  id: number;
  lesson_id: number;
  child_id: number;
  status: BookingStatus;
  is_charged: number;
  charge_amount: number;
  is_makeup: number;
  created_at: string;
  updated_at: string;
  child_name: string;
  lesson_title: string;
  lesson_type: LessonType;
  start_time: string;
  duration_minutes: number;
  single_price: number;
  is_canceled: number;
}

export interface WaitlistEntry {
  id: number;
  lesson_id: number;
  child_id: number;
  status: string;
  created_at: string;
  child_name: string;
  lesson_title: string;
  start_time: string;
}

export interface PaymentItem {
  id: number;
  family_id?: number;
  tariff_id: number | null;
  external_payment_id: string | null;
  amount: number;
  lessons_count: number;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  confirmation_url?: string | null;
  receipt_url: string | null;
  has_receipt_file: number;
  receipt_original_name: string | null;
  created_at: string;
  paid_at: string | null;
  tariff_title: string | null;
  parent_name?: string;
  phone?: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

export interface ReviewItem {
  id: number;
  family_id: number | null;
  author_name: string;
  child_info: string | null;
  rating: number;
  text: string;
  is_published: number;
  created_at: string;
}

export type LegalDocKey = 'offer' | 'personal_data' | 'privacy';

export interface LegalDocumentItem {
  doc_key: LegalDocKey;
  title: string;
  has_file: number;
  original_name: string | null;
  mime_type: string | null;
  content_text: string;
  updated_at: string;
}

export interface ParentDashboardData {
  family: {
    id: number;
    parent_name: string;
    phone: string;
    money_balance: number;
  };
  children: ChildProfile[];
  subscriptions: SubscriptionItem[];
  total_remaining_lessons: number;
  nearest_expiry: string | null;
  bookings: ParentBooking[];
  waitlist: WaitlistEntry[];
  payments: PaymentItem[];
  notifications: NotificationItem[];
  unread_notifications_count: number;
  push_subscription_count?: number;
  tariffs: Tariff[];
  settings: WorkshopSettings;
  reviews: ReviewItem[];
  legal_documents: LegalDocumentItem[];
  schedule: PublicLesson[];
}

export interface MasterLessonBooking {
  id: number;
  lesson_id: number;
  child_id: number;
  status: BookingStatus;
  is_charged: number;
  charge_amount: number;
  is_makeup: number;
  updated_at: string;
  child_name: string;
  child_age: number;
  family_id: number;
  parent_name: string;
  phone: string;
}

export interface MasterWaitlistItem {
  id: number;
  lesson_id: number;
  child_id: number;
  status: string;
  created_at: string;
  child_name: string;
  parent_name: string;
  phone: string;
}

export interface MasterLesson extends PublicLesson {
  bookings: MasterLessonBooking[];
  waitlist: MasterWaitlistItem[];
}

export interface MasterFamily {
  id: number;
  parent_name: string;
  phone: string;
  access_token: string;
  money_balance: number;
  created_at: string;
  children: ChildProfile[];
  subscriptions: SubscriptionItem[];
  remaining_lessons: number;
  needs_renewal: boolean;
}

export interface AttendanceLogItem {
  id: number;
  booking_id: number;
  old_status: BookingStatus;
  new_status: BookingStatus;
  reason: string | null;
  changed_at: string;
  child_name: string;
  lesson_title: string;
}

export interface MasterDashboardData {
  lessons: MasterLesson[];
  families: MasterFamily[];
  payments: PaymentItem[];
  tariffs: Tariff[];
  attendance_logs: AttendanceLogItem[];
  reviews: ReviewItem[];
  legal_documents: LegalDocumentItem[];
  settings: WorkshopSettings;
  db_size_bytes: number;
}
