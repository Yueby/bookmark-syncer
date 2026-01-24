import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 生成内容哈希（用于书签同步）
 * @param url 书签 URL
 * @param title 书签标题
 * @returns SHA-256 哈希值（64 个十六进制字符）
 */
export async function generateHash(url: string, title: string): Promise<string> {
  const content = `${url}|${title}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
