"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpenIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  UserIcon,
} from "lucide-react";

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

export function SignUpForm() {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "注册失败");
        return;
      }
      toast.success("注册成功，已自动登录");
      router.replace("/books");
      router.refresh();
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  const inputShellClass = cn(
    "border-input focus-within:border-ring focus-within:ring-ring/20 rounded-md border bg-transparent transition-colors focus-within:ring-[3px]"
  );

  const inputClass = cn(
    "h-10 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center justify-items-center text-center">
        <div className="bg-primary/10 text-primary mb-2 flex size-12 items-center justify-center rounded-xl">
          <BookOpenIcon className="size-6" />
        </div>
        <CardTitle className="text-xl">注册管理员</CardTitle>
        <CardDescription>
          创建系统管理员账号
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signup-name">姓名</Label>
            <div className={inputShellClass}>
              <div className="flex items-center gap-2 px-3">
                <UserIcon className="text-muted-foreground size-4 shrink-0" />
                <Input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入姓名"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">邮箱</Label>
            <div className={inputShellClass}>
              <div className="flex items-center gap-2 px-3">
                <MailIcon className="text-muted-foreground size-4 shrink-0" />
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">密码</Label>
            <div className={inputShellClass}>
              <div className="flex items-center gap-2 px-3">
                <LockIcon className="text-muted-foreground size-4 shrink-0" />
                <Input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className={inputClass}
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
          <div className="space-y-2">
            <Label htmlFor="signup-confirm-password">确认密码</Label>
            <div className={inputShellClass}>
              <div className="flex items-center gap-2 px-3">
                <CheckIcon className="text-muted-foreground size-4 shrink-0" />
                <Input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入密码"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                  className="text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
                >
                  {showConfirmPassword ? (
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
            {loading ? "注册中…" : "注册"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
