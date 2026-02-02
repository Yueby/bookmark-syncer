/**
 * 加密工具函数
 * 提供哈希计算等加密相关功能
 */

/**
 * 生成内容哈希（用于书签同步）
 * 使用 SHA-256 算法对书签内容进行哈希
 * 
 * @param url 书签 URL
 * @param title 书签标题
 * @returns SHA-256 哈希值（64 个十六进制字符）
 */
export async function generateHash(url: string, title: string): Promise<string> {
  const content = `${url}|${title}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
