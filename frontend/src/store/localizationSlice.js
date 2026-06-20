import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../services/api'

const DEFAULT = {
  date_format: 'DD-MM-YYYY',
  time_format: '12h',
  timezone: 'Asia/Kolkata',
  language: 'en',
  currency: 'INR',
  currency_symbol: '₹',
  number_format: 'en-IN',
  fiscal_year_start: 'April',
}

export const fetchLocalization = createAsyncThunk(
  'localization/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/tenant-settings/localization')
      const data = res.data?.data || {}
      // Strip MongoDB metadata fields, keep only localization payload
      const { _id, id, company_id, key, created_at, updated_at, created_by, updated_by, ...settings } = data
      return Object.keys(settings).length > 0 ? settings : DEFAULT
    } catch {
      return rejectWithValue(DEFAULT)
    }
  }
)

export const saveLocalization = createAsyncThunk(
  'localization/save',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await api.put('/tenant-settings/localization', payload)
      const data = res.data?.data || payload
      const { _id, id, company_id, key, created_at, updated_at, created_by, updated_by, ...settings } = data
      return settings
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
        state.settings = { ...DEFAULT, ...state.settings, ...action.payload }
      })
      .addCase(saveLocalization.rejected, (state, action) => {
        state.error = action.payload
      })
  },
})

export const { setLocalization } = localizationSlice.actions
export const selectLocalization = (state) => state.localization.settings
export const selectLocalizationStatus = (state) => state.localization.status
export default localizationSlice.reducer
