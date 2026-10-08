import { z } from 'zod'
import { paperSize } from './common'

// Auth + profile schemas, shared by forms (client) and route handlers (server).

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address')
  .email('Enter a valid email address')
  .max(254, 'That email address is too long')

export const newPasswordField = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(72, 'Use 72 characters or fewer')

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password').max(72, 'Use 72 characters or fewer'),
})

export const signupSchema = z
  .object({
    email: emailField,
    password: newPasswordField,
    confirm: z.string().min(1, 'Re-enter your password'),
    consent: z.boolean().refine((value) => value === true, 'Please confirm to continue'),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

export const forgotPasswordSchema = z.object({ email: emailField })

export const resetPasswordSchema = z
  .object({
    password: newPasswordField,
    confirm: z.string().min(1, 'Re-enter your password'),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

export const resendConfirmationSchema = z.object({ email: emailField })

export const profilePatchSchema = z
  .object({
    paperSize: paperSize.optional(),
    locale: z.string().trim().min(2).max(10).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' })

export type LoginValues = z.infer<typeof loginSchema>
export type SignupValues = z.infer<typeof signupSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
export type ProfilePatch = z.infer<typeof profilePatchSchema>
