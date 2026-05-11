import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateSystemCode(prefix: string, part1?: string, part2?: string, part3?: string) {
  const parts = [prefix];
  if (part1) {
     // Extract numeric part if it's already a code like FAM-XXXX
     const clean = part1.includes('-') ? part1.split('-').pop() : part1;
     parts.push(clean || '');
  }
  if (part2) parts.push(part2);
  if (part3) parts.push(part3);
  return parts.filter(Boolean).join('-');
}

