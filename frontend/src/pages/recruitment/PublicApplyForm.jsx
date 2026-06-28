import { useParams } from 'react-router-dom'
import CandidatePublicForm from './CandidatePublicForm'

/**
 * Route handler for /apply/public/:slug
 * Delegates entirely to CandidatePublicForm in slug mode.
 * All form logic, validation, UI, and submission handling lives there.
 */
const PublicApplyForm = () => {
  const { slug } = useParams()
  return <CandidatePublicForm slug={slug} />
}

export default PublicApplyForm
