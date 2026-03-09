import axios, { AxiosError } from 'axios'
import { config } from '../config'

export const API_BASE_URL = config.apiBaseUrl

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
})

export function extractApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.error || error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}
