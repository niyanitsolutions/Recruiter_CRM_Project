import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'
import localizationReducer from './localizationSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    localization: localizationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

export default store