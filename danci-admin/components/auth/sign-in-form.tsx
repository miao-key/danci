"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BookOpenIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") || "/books";

  const [email, setEmail] = React.useState("admin@example.com");
  const [password, setPassword] = React.useState("admin123456");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "登录失败");
        return;
      }
      toast.success("登录成功");
      router.replace(nextPath);
      router.refresh();
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center justify-items-center text-center">
        <div className="bg-primary/10 text-primary mb-2 flex size-12 items-center justify-center rounded-xl">
          <BookOpenIcon className="size-6" />
        </div>
        <CardTitle className="text-xl">管理员登录</CardTitle>
        <CardDescription>
          使用邮箱和密码登录管理后台
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signin-email">邮箱</Label>
            <div className="border-input focus-within:border-ring focus-within:ring-ring/20 rounded-md border bg-transparent transition-colors focus-within:ring-[3px]">
              <div className="flex items-center gap-2 px-3">
                <MailIcon className="text-muted-foreground size-4 shrink-0" />
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  className={cn(
                    "h-10 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  )}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signin-password">密码</Label>
            <div className="border-input focus-within:border-ring focus-within:ring-ring/20 rounded-md border bg-transparent transition-colors focus-within:ring-[3px]">
              <div className="flex items-center gap-2 px-3">
                <LockIcon className="text-muted-foreground size-4 shrink-0" />
                <Input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className={cn(
                    "h-10 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  className="text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading}
          >
            {loading ? "登录中…" : "登录"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
