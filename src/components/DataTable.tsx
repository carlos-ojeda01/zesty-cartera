import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type } from '@/theme/tokens';

export interface Column<R> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  flex: number;
  render: (row: R) => ReactNode;
  /** Se omite en tablet, donde el ancho no da para todas las columnas. */
  optional?: boolean;
}

/**
 * Tabla de lectura para movimientos, dividendos y caja.
 *
 * No ordena ni filtra a propósito: son cartolas, y una cartola se lee en orden
 * cronológico. La tabla que sí necesita ordenarse —posiciones— tiene su propio
 * componente porque además cambia de forma en teléfono.
 *
 * En teléfono cada fila la dibuja `renderPhone`, que entrega el tab dueño de
 * los datos. Un colapso automático de columnas a lista siempre termina
 * eligiendo mal cuál es el dato principal.
 */
export function DataTable<R>({
  rows,
  columns,
  keyOf,
  renderPhone,
  empty = 'Sin registros en este período.',
}: {
  rows: R[];
  columns: Column<R>[];
  keyOf: (row: R) => string;
  renderPhone: (row: R) => ReactNode;
  empty?: string;
}) {
  const theme = useTheme();
  const { isPhone, isRoomy } = useLayout();

  if (rows.length === 0) {
    return (
      <T style={{ color: theme.textMuted, fontSize: type.body, paddingVertical: space.lg }}>
        {empty}
      </T>
    );
  }

  if (isPhone) {
    return (
      <View>
        {rows.map((r) => (
          <View key={keyOf(r)} style={[styles.phoneRow, { borderBottomColor: theme.border }]}>
            {renderPhone(r)}
          </View>
        ))}
      </View>
    );
  }

  const cols = columns.filter((c) => isRoomy || !c.optional);

  return (
    <View>
      <View style={[styles.head, { borderBottomColor: theme.rule }]}>
        {cols.map((c) => (
          <T
            key={c.key}
            style={{
              flex: c.flex,
              textAlign: c.align === 'right' ? 'right' : 'left',
              color: theme.textMuted,
              fontSize: type.nano,
              letterSpacing: 0.9,
              textTransform: 'uppercase',
              fontWeight: '600',
            }}
          >
            {c.label}
          </T>
        ))}
      </View>

      {rows.map((r) => (
        <View key={keyOf(r)} style={[styles.row, { borderBottomColor: theme.border }]}>
          {cols.map((c) => (
            <View
              key={c.key}
              style={{ flex: c.flex, alignItems: c.align === 'right' ? 'flex-end' : 'flex-start' }}
            >
              {c.render(r)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    gap: space.md,
    paddingBottom: 9,
    borderBottomWidth: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  phoneRow: { paddingVertical: 11, borderBottomWidth: 1 },
});
