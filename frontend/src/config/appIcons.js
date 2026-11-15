// The glyphs and colours an app or a menu tab the OPERATOR made may wear
// («Ilovalar tuzilmasi», the org chart's «Ilovalar» view). A stored layout names
// an icon by its key here (services/nav_layout.py keeps the name, never a
// component), so a key must never be renamed — add, do not replace. The apps
// the code ships keep their own icons (config/navLinks.js); these are what the
// picker offers, for them too.
import {
  Award, BadgeCheck, Banknote, Bell, BookOpen, Bot, Boxes, BriefcaseBusiness, Building2,
  CakeSlice, Calculator, CalendarCheck, CalendarClock, CalendarDays, Camera, ChartColumn,
  ChartLine, ChartPie, ChefHat, ClipboardCheck, ClipboardList, Clock, Coffee, Cog, Cookie,
  Cpu, Croissant, Database, Factory, FileText, Fingerprint, Flame, Folder, FolderOpen,
  Gauge, Globe, GraduationCap, Hammer, HandCoins, HardHat, Heart, KeyRound, LayoutDashboard,
  LayoutGrid, Leaf, Library, Lightbulb, ListChecks, Map, Megaphone, MessageSquare, Monitor,
  Network, Package, Phone, Recycle, Rocket, Scale, ScanFace, Settings, Shield, ShieldCheck,
  ShoppingCart, Sparkles, Sprout, Star, Stethoscope, Store, Target, TestTubes, Thermometer,
  TrendingUp, Trophy, Truck, User, Users, UsersRound, Utensils, Wallet, Warehouse, Wrench, Zap,
} from "lucide-react";

export const APP_ICONS = {
  LayoutGrid, LayoutDashboard, Folder, FolderOpen, Factory, Warehouse, Boxes, Package, Truck,
  Store, ShoppingCart, Building2, Users, UsersRound, User, BriefcaseBusiness, HardHat,
  GraduationCap, BookOpen, Library, ClipboardList, ClipboardCheck, ListChecks, FileText,
  CalendarDays, CalendarCheck, CalendarClock, Clock, ChartColumn, ChartLine, ChartPie,
  TrendingUp, Gauge, Target, Trophy, Award, Star, BadgeCheck, Shield, ShieldCheck, KeyRound,
  Fingerprint, ScanFace, Wrench, Hammer, Cog, Settings, Cpu, Zap, Thermometer, Flame,
  ChefHat, Utensils, Coffee, Croissant, CakeSlice, Cookie, Wallet, Banknote, HandCoins,
  Calculator, Scale, Megaphone, Bell, MessageSquare, Phone, Globe, Map, Network, Database,
  Monitor, Camera, Bot, Sparkles, Lightbulb, Rocket, TestTubes, Stethoscope, Heart, Leaf,
  Sprout, Recycle,
};

// The tile colours index.css defines (`[data-app-hue]`) — a stored layout names
// one of these.
export const APP_HUES = [
  "gold", "amber", "yellow", "orange", "red", "rose", "pink", "fuchsia", "violet",
  "indigo", "blue", "sky", "cyan", "teal", "emerald", "lime", "slate",
];

// What an app or a menu tab wears when it names no icon of its own.
export const DEFAULT_APP_ICON = LayoutGrid;
export const DEFAULT_TAB_ICON = Folder;
