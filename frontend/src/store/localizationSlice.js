import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../services/api'

const DEFAULT = {
  date_format: 'DD-MM-YYYY',
  time_format: '12h',
  timezone: 'Asia/Kolkata',
  language: 'en',
}

export const fetchLocalization = createAsyncThunk(
  'localization/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/company-settings/localization')
      return res.data?.data || DEFAULT
    } catch {
      return rejectWithValue(DEFAULT)
    }
  }
)

export const saveLocalization = createAsyncThunk(
  'localization/save',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await api.put('/company-settings/localization', payload)
      return res.data?.data || payload
    } catch (err) {
      return rejectWithValue(err?.response?.data?.detail || 'Failed to save localization')
    }
  }
)

const localizationSlice = createSlice({
  name: 'localization',
  initialState: { settings: DEFAULT, status: 'idle', error: null },
  reducers: {
    setLocalization(state, action) {
      state.settings = { ...DEFAULT, ...action.payload }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLocalization.fulfilled, (state, action) => {
        state.settings = { ...DEFAULT, ...action.payload }
        state.status = 'loaded'
        state.error = null
      })
      .addCase(fetchLocalization.rejected, (state) => {
        state.status = 'idle'
      })
      .addCase(saveLocalization.fulfilled, (state, action) => {
        state.settings = { ...state.settings, ...action.payload }
      })
      .addCase(saveLocalization.rejected, (state, action) => {
        state.error = action.payload
      })
  },
})

export const { setLocalization } = localizationSlice.actions
export const selectLocalization = (state) => state.localization.settings
export default localizationSlice.reducer
