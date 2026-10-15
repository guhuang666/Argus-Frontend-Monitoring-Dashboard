import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { request } from './client'
import type { ErrorEventRow, PageResult, PerformanceRow } from './types'

/**
 * 表格分页尺寸的合法取值。
 *
 * 上限必须是 100：后端两个控制器的 PageQueryDto 上写着 @Max(100)，
 * 传更大的值会被 ValidationPipe 直接打回 400，不是安静地截断。
 * 所以这里是"与后端契约对齐"的常量，不是随手写的 UI 偏好。
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

/** 与后端 PageQueryDto 的默认值一致 */
export const DEFAULT_PAGE_SIZE = 20

/**
 * 异常事件分页查询。
 *
 * 两个刻意的写法：
 *   ① 页码与页大小进 queryKey —— 翻页即新查询，每页各自缓存，
 *      来回翻页不会重复请求
 *   ② placeholderData: keepPreviousData —— 新页数据到位前先显示上一页，
 *      表格不会闪成空骨架、高度也不跳。配套要用 isPlaceholderData 标记"这是旧数据"
 */
export function useErrorEvents(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['error-events', page, pageSize],
    queryFn: () => request<PageResult<ErrorEventRow>>('/v1/error', { page, pageSize }),
    placeholderData: keepPreviousData,
  })
}

/** 性能指标分页查询。与异常列表同构，只是换接口与行类型 */
export function usePerformanceMetrics(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['performance-metrics', page, pageSize],
    queryFn: () => request<PageResult<PerformanceRow>>('/v1/performance', { page, pageSize }),
    placeholderData: keepPreviousData,
  })
}
