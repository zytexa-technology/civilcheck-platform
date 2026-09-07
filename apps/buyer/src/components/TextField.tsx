import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { colors, radius, spacing } from '../theme'

interface TextFieldProps extends Pick<TextInputProps, 'autoCapitalize' | 'autoCorrect' | 'onSubmitEditing' | 'returnKeyType' | 'secureTextEntry'> {
  label?: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  /** Field-level validation message. Renders the input in the error colour. */
  error?: string
  /** Guidance shown when there is no error. */
  hint?: string
  keyboardType?: KeyboardTypeOptions
  maxLength?: number
  editable?: boolean
  multiline?: boolean
  style?: StyleProp<ViewStyle>
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  keyboardType,
  maxLength,
  editable = true,
  multiline = false,
  style,
  ...inputProps
}: TextFieldProps) {
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[
          styles.input,
          multiline && styles.multiline,
          error ? styles.inputError : null,
          !editable && styles.inputDisabled,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        keyboardType={keyboardType}
        maxLength={maxLength}
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        accessibilityLabel={label}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: {
    fontSize: 11.5,
    fontWeight: '500',
    color: colors.muted,
    marginBottom: 7,
  },
  input: {
    width: '100%',
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.border2,
    borderRadius: radius.sm,
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontSize: 14,
    color: colors.text,
  },
  multiline: { minHeight: 96, paddingTop: 13 },
  inputError: { borderColor: colors.redBorder },
  inputDisabled: { opacity: 0.6 },
  error: { fontSize: 11, color: colors.red, marginTop: 5 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 5 },
})
