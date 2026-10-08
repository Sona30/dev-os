import { Card } from '@/components/ui/Card'

interface AuthFormProps {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

/** Shared layout for login, sign-up, forgot-password and reset-password. */
export function AuthForm({ title, description, children, footer }: AuthFormProps) {
  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h4">{title}</h1>
        {description ? <p className="text-body text-text-secondary">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="border-t border-line pt-4 text-body text-text-secondary">{footer}</div> : null}
    </Card>
  )
}
