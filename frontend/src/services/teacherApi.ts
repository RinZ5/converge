import type { Subject, Teacher } from '../types'
import { API_ENDPOINTS } from '../config/endpoints'
import { fetchApi, fetchList, postApi, createApiGetAll } from '../utils/api'
export const teacherApi = {
  getAll: createApiGetAll<Teacher>(API_ENDPOINTS.TEACHERS),
  getBySubject: (subjectId: number) => {
    const url = new URLSearchParams({ subject_id: subjectId.toString() })
    return fetchList<Teacher>(`${API_ENDPOINTS.TEACHERS}?${url}`)
  },
  create: (name: string, email: string, gender: string) =>
    postApi<Teacher>(API_ENDPOINTS.TEACHERS, { name, email, gender }),
  setStatus: (id: number, status: string) =>
    fetchApi<{ message: string }>(`${API_ENDPOINTS.TEACHERS}/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  getSubjects: (id: number) => fetchList<Subject>(`${API_ENDPOINTS.TEACHERS}/${id}/subjects`),
  // A full replace, matching the API: the list sent is the teacher's whole set.
  setSubjects: (id: number, subjectIds: number[]) =>
    fetchApi<{ message: string }>(`${API_ENDPOINTS.TEACHERS}/${id}/subjects`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_ids: subjectIds }),
    }),
  setGender: (id: number, gender: string) =>
    fetchApi<{ message: string }>(`${API_ENDPOINTS.TEACHERS}/${id}/gender`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gender }),
    }),
}
